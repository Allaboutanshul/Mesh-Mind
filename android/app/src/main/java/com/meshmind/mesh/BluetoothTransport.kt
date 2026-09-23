package com.meshmind.mesh

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@SuppressLint("MissingPermission")
class BluetoothTransport(
    private val context: Context,
    private val localNodeId: String
) : MeshTransport {

    private val TAG = "BluetoothTransport"
    // Fixed UUID for MeshMind Bluetooth service
    private val MESH_UUID = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb") // Standard SPP UUID, or custom
    private val APP_NAME = "MeshMind"

    private var callback: TransportCallback? = null
    
    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter

    private var acceptThread: AcceptThread? = null
    private val connectedThreads = ConcurrentHashMap<String, ConnectedThread>()
    
    private var isDiscovering = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action = intent.action
            if (BluetoothDevice.ACTION_FOUND == action) {
                val device: BluetoothDevice? = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                val deviceName = device?.name
                val deviceAddress = device?.address ?: return
                
                // We only try to connect to devices if they have a name indicating they are a node (e.g. NODE-XXXX)
                // Or we can just try to connect to any device that exposes our UUID, but Android discovery 
                // doesn't fetch SDP automatically immediately in all cases.
                if (deviceName != null && deviceName.startsWith("NODE-")) {
                    Log.i(TAG, "Discovered MeshMind peer: $deviceName ($deviceAddress)")
                    callback?.onEndpointDiscovered(deviceAddress, deviceName)
                    
                    if (!connectedThreads.containsKey(deviceAddress)) {
                        connectToDevice(device)
                    }
                }
            }
        }
    }

    override fun setCallback(callback: TransportCallback) {
        this.callback = callback
    }

    override fun startAdvertising() {
        if (!hasPermissions()) {
            Log.e(TAG, "Missing Bluetooth permissions")
            return
        }
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
            Log.e(TAG, "Bluetooth is disabled or not supported")
            return
        }
        
        // Android requires the device to be discoverable for others to find it via standard discovery.
        // We will just start the server socket. If the devices are already paired, they can connect.
        // If not, the user must make the device discoverable via system settings, or we request it.
        // For this automated test, we will assume devices are paired or we can connect via MAC.
        if (acceptThread == null) {
            acceptThread = AcceptThread()
            acceptThread?.start()
            Log.i(TAG, "Bluetooth Server Socket started (Advertising equivalent)")
            callback?.logMessage("[BLUETOOTH] Server Socket listening...")
        }
    }

    override fun startDiscovery() {
        if (!hasPermissions() || bluetoothAdapter == null) return
        
        val filter = IntentFilter(BluetoothDevice.ACTION_FOUND)
        context.registerReceiver(receiver, filter)
        isDiscovering = true

        if (bluetoothAdapter.isDiscovering) {
            bluetoothAdapter.cancelDiscovery()
        }
        bluetoothAdapter.startDiscovery()
        Log.i(TAG, "Bluetooth discovery started")
        callback?.logMessage("[BLUETOOTH] Discovery started")
    }

    override fun stopAll() {
        if (isDiscovering) {
            try {
                context.unregisterReceiver(receiver)
            } catch (e: Exception) {}
            isDiscovering = false
        }
        if (hasPermissions()) {
            bluetoothAdapter?.cancelDiscovery()
        }
        acceptThread?.cancel()
        acceptThread = null
        
        for ((_, thread) in connectedThreads) {
            thread.cancel()
        }
        connectedThreads.clear()
    }

    override fun refresh() {
        Log.i(TAG, "Refreshing Bluetooth Classic...")
        callback?.logMessage("[BLUETOOTH] Refreshing transport...")
        
        val endpoints = connectedThreads.keys.toList()
        stopAll()
        for (ep in endpoints) {
            callback?.onDisconnected(ep)
        }
        
        startAdvertising()
        startDiscovery()
    }

    override fun sendPayload(endpointId: String, payload: String) {
        val thread = connectedThreads[endpointId]
        if (thread != null) {
            thread.write(payload)
        } else {
            Log.e(TAG, "Attempted to send payload to unknown endpoint: $endpointId")
        }
    }

    override fun getConnectedEndpoints(): List<String> {
        return connectedThreads.keys.toList()
    }

    private fun connectToDevice(device: BluetoothDevice) {
        callback?.onConnectionInitiated(device.address, device.name ?: "Unknown")
        ConnectThread(device).start()
    }
    
    private fun hasPermissions(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED &&
                   ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
        }
        return ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH) == PackageManager.PERMISSION_GRANTED
    }

    private inner class AcceptThread : Thread() {
        private val mmServerSocket: BluetoothServerSocket? by lazy(LazyThreadSafetyMode.NONE) {
            bluetoothAdapter?.listenUsingInsecureRfcommWithServiceRecord(APP_NAME, MESH_UUID)
        }

        override fun run() {
            var shouldLoop = true
            while (shouldLoop) {
                val socket: BluetoothSocket? = try {
                    mmServerSocket?.accept()
                } catch (e: IOException) {
                    Log.e(TAG, "Socket's accept() method failed", e)
                    shouldLoop = false
                    null
                }
                socket?.also {
                    val address = it.remoteDevice.address
                    Log.i(TAG, "Accepted connection from $address")
                    manageConnectedSocket(it)
                }
            }
        }

        fun cancel() {
            try {
                mmServerSocket?.close()
            } catch (e: IOException) {
                Log.e(TAG, "Could not close the connect socket", e)
            }
        }
    }

    private inner class ConnectThread(private val device: BluetoothDevice) : Thread() {
        private val mmSocket: BluetoothSocket? by lazy(LazyThreadSafetyMode.NONE) {
            device.createInsecureRfcommSocketToServiceRecord(MESH_UUID)
        }

        override fun run() {
            bluetoothAdapter?.cancelDiscovery()

            mmSocket?.let { socket ->
                try {
                    socket.connect()
                    Log.i(TAG, "Connected to ${device.address}")
                    callback?.onConnectionResult(device.address, true)
                    manageConnectedSocket(socket)
                } catch (e: IOException) {
                    Log.e(TAG, "Could not connect to ${device.address}", e)
                    callback?.onConnectionResult(device.address, false)
                    try {
                        socket.close()
                    } catch (closeException: IOException) {
                        Log.e(TAG, "Could not close the client socket", closeException)
                    }
                }
            }
        }

        fun cancel() {
            try {
                mmSocket?.close()
            } catch (e: IOException) {
                Log.e(TAG, "Could not close the client socket", e)
            }
        }
    }

    @Synchronized
    private fun manageConnectedSocket(socket: BluetoothSocket) {
        val address = socket.remoteDevice.address
        if (connectedThreads.containsKey(address)) {
            connectedThreads[address]?.cancel()
        }
        val thread = ConnectedThread(socket)
        connectedThreads[address] = thread
        thread.start()
        
        val name = socket.remoteDevice.name ?: address
        callback?.onConnectionResult(address, true)
        callback?.logMessage("[BLUETOOTH] Connection ESTABLISHED → $name ($address)")
    }

    private inner class ConnectedThread(private val mmSocket: BluetoothSocket) : Thread() {
        private val mmInStream: DataInputStream = DataInputStream(mmSocket.inputStream)
        private val mmOutStream: DataOutputStream = DataOutputStream(mmSocket.outputStream)
        private val address = mmSocket.remoteDevice.address

        override fun run() {
            while (true) {
                try {
                    // Packet Framing: Read length prefix (4 bytes)
                    val length = mmInStream.readInt()
                    if (length > 0 && length < 1024 * 1024) { // Max 1MB payload to prevent OOM
                        val payloadBytes = ByteArray(length)
                        mmInStream.readFully(payloadBytes)
                        val payloadString = String(payloadBytes, Charsets.UTF_8)
                        
                        // Callback to Engine
                        callback?.onPayloadReceived(address, payloadString)
                    }
                } catch (e: IOException) {
                    Log.d(TAG, "Input stream was disconnected", e)
                    connectedThreads.remove(address)
                    callback?.onDisconnected(address)
                    break
                }
            }
        }

        fun write(payload: String) {
            try {
                val bytes = payload.toByteArray(Charsets.UTF_8)
                // Packet Framing: Write length prefix (4 bytes)
                mmOutStream.writeInt(bytes.size)
                mmOutStream.write(bytes)
                mmOutStream.flush()
            } catch (e: IOException) {
                Log.e(TAG, "Error occurred when sending data", e)
                connectedThreads.remove(address)
                callback?.onDisconnected(address)
                cancel()
            }
        }

        fun cancel() {
            try {
                mmSocket.close()
            } catch (e: IOException) {
                Log.e(TAG, "Could not close the connect socket", e)
            }
        }
    }
}
