package com.meshmind.mesh

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import java.util.UUID

/**
 * BleGatewayManager — connects Android to physical ESP32-WROOM-32 BLE Gateway.
 *
 * Scans for ESP32 BLE Service 4FAFC201-1FB5-459E-8FCC-C5C9C331914B,
 * connects via BLE GATT, and forwards MeshMessage JSON packets over BLE GATT Characteristic Write.
 */
class BleGatewayManager(private val context: Context) {

    companion object {
        private const val TAG = "BleGateway"
        val SERVICE_UUID: UUID = UUID.fromString("4fafc201-1fb5-459e-8fcc-c5c9c331914b")
        val CHARACTERISTIC_UUID: UUID = UUID.fromString("beb5483e-36e1-4688-b7f5-ea07361b26a8")
    }

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        manager?.adapter
    }

    private val bleScanner: BluetoothLeScanner?
        get() = bluetoothAdapter?.bluetoothLeScanner

    private var gatt: BluetoothGatt? = null
    private var rxCharacteristic: BluetoothGattCharacteristic? = null
    private var isConnected = false
    private var isScanning = false
    private val handler = Handler(Looper.getMainLooper())

    fun startScanningAndConnect() {
        if (bluetoothAdapter == null || !bluetoothAdapter!!.isEnabled) {
            Log.w(TAG, "[BLE GATEWAY] Bluetooth is disabled or unavailable")
            return
        }
        if (isConnected || isScanning) return

        val scanner = bleScanner ?: return
        isScanning = true
        Log.i(TAG, "[BLE GATEWAY] Scanning for ESP32 Gateway (Service $SERVICE_UUID)...")

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        try {
            scanner.startScan(listOf(filter), settings, scanCallback)
            // Stop scanning after 15 seconds if not found
            handler.postDelayed({
                if (isScanning && !isConnected) {
                    stopScan()
                    Log.d(TAG, "[BLE GATEWAY] Scan timeout — will retry on next message send")
                }
            }, 15000)
        } catch (e: SecurityException) {
            Log.e(TAG, "[BLE GATEWAY] Permission missing for BLE scan: ${e.localizedMessage}")
        } catch (e: Exception) {
            Log.e(TAG, "[BLE GATEWAY] Scan start failed: ${e.localizedMessage}")
        }
    }

    private fun stopScan() {
        if (!isScanning) return
        try {
            bleScanner?.stopScan(scanCallback)
        } catch (_: Exception) {}
        isScanning = false
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult?) {
            val device = result?.device ?: return
            Log.i(TAG, "[BLE GATEWAY] Discovered ESP32 BLE device: ${device.name ?: "Unknown"} [${device.address}]")
            stopScan()
            connectToDevice(device)
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(TAG, "[BLE GATEWAY] Scan failed with code: $errorCode")
            isScanning = false
        }
    }

    private fun connectToDevice(device: BluetoothDevice) {
        Log.i(TAG, "[BLE GATEWAY] Connecting GATT to ${device.address}...")
        try {
            gatt = device.connectGatt(context, false, gattCallback)
        } catch (e: SecurityException) {
            Log.e(TAG, "[BLE GATEWAY] Permission missing for connectGatt: ${e.localizedMessage}")
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt?, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                Log.i(TAG, "[BLE GATEWAY] Connected to ESP32 GATT Server. Requesting MTU 512...")
                isConnected = true
                try {
                    gatt?.requestMtu(512)
                } catch (e: SecurityException) {
                    gatt?.discoverServices()
                }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.w(TAG, "[BLE GATEWAY] Disconnected from ESP32 GATT Server")
                isConnected = false
                rxCharacteristic = null
                this@BleGatewayManager.gatt?.close()
                this@BleGatewayManager.gatt = null
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt?, mtu: Int, status: Int) {
            Log.i(TAG, "[BLE GATEWAY] MTU updated to $mtu. Discovering services...")
            try {
                gatt?.discoverServices()
            } catch (e: SecurityException) {
                Log.e(TAG, "[BLE GATEWAY] Permission missing for discoverServices: ${e.localizedMessage}")
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt?, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                val service = gatt?.getService(SERVICE_UUID)
                rxCharacteristic = service?.getCharacteristic(CHARACTERISTIC_UUID)
                if (rxCharacteristic != null) {
                    Log.i(TAG, "✅ [BLE GATEWAY] ESP32 Gateway READY! Characteristic $CHARACTERISTIC_UUID ready for writes.")
                } else {
                    Log.e(TAG, "[BLE GATEWAY] Characteristic $CHARACTERISTIC_UUID not found on ESP32 service")
                }
            }
        }

        override fun onCharacteristicWrite(gatt: BluetoothGatt?, characteristic: BluetoothGattCharacteristic?, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.i(TAG, "📡 [BLE GATEWAY] Packet successfully written to ESP32 BLE GATT Characteristic")
            } else {
                Log.w(TAG, "[BLE GATEWAY] Characteristic write failed status=$status")
            }
        }
    }

    fun sendMeshMessage(json: String) {
        if (!isConnected || rxCharacteristic == null || gatt == null) {
            Log.d(TAG, "[BLE GATEWAY] Not connected to ESP32. Starting background scan...")
            startScanningAndConnect()
            return
        }

        try {
            val bytes = json.toByteArray(Charsets.UTF_8)
            rxCharacteristic?.value = bytes
            rxCharacteristic?.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            val success = gatt?.writeCharacteristic(rxCharacteristic) ?: false
            if (success) {
                Log.i(TAG, "🚀 [BLE GATEWAY] Sent ${bytes.size} bytes JSON to ESP32 over REAL BLE!")
            } else {
                Log.w(TAG, "[BLE GATEWAY] writeCharacteristic returned false")
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "[BLE GATEWAY] Security Exception on write: ${e.localizedMessage}")
        } catch (e: Exception) {
            Log.e(TAG, "[BLE GATEWAY] Failed to send JSON to ESP32: ${e.localizedMessage}")
        }
    }
}
