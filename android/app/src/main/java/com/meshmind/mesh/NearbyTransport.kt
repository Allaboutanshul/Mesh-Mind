package com.meshmind.mesh

import android.content.Context
import android.util.Log
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.*
import java.util.concurrent.ConcurrentHashMap

class NearbyTransport(
    private val context: Context,
    private val localNodeId: String
) : MeshTransport {

    private val SERVICE_ID = "com.meshmind.mesh.SERVICE"
    private val TAG = "NearbyTransport"
    
    private val nearby by lazy { Nearby.getConnectionsClient(context) }
    private var callback: TransportCallback? = null
    private val connectedEndpoints = ConcurrentHashMap<String, String>()

    override fun setCallback(callback: TransportCallback) {
        this.callback = callback
    }

    override fun startAdvertising() {
        val opts = AdvertisingOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build()
        nearby.startAdvertising(localNodeId, SERVICE_ID, connectionLifecycleCallback, opts)
            .addOnSuccessListener {
                Log.i(TAG, "Advertising active as $localNodeId")
                callback?.logMessage("[NEARBY] Advertising active as $localNodeId")
            }
            .addOnFailureListener { e ->
                val msg = e.localizedMessage ?: ""
                if (!msg.contains("8001") && !msg.contains("ALREADY_ADVERTISING")) {
                    Log.e(TAG, "Advertising failed: $msg")
                    callback?.logMessage("[NEARBY] Advertising error: $msg")
                }
            }
    }

    override fun startDiscovery() {
        val opts = DiscoveryOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build()
        nearby.startDiscovery(SERVICE_ID, endpointDiscoveryCallback, opts)
            .addOnSuccessListener {
                Log.i(TAG, "Discovery active for $SERVICE_ID")
                callback?.logMessage("[NEARBY] Discovery active")
            }
            .addOnFailureListener { e ->
                val msg = e.localizedMessage ?: ""
                if (!msg.contains("8002") && !msg.contains("ALREADY_DISCOVERING")) {
                    Log.e(TAG, "Discovery failed: $msg")
                    callback?.logMessage("[NEARBY] Discovery error: $msg")
                }
            }
    }

    override fun stopAll() {
        nearby.stopAllEndpoints()
        nearby.stopAdvertising()
        nearby.stopDiscovery()
        connectedEndpoints.clear()
    }

    override fun refresh() {
        Log.i(TAG, "Refreshing Nearby Connections...")
        callback?.logMessage("[NEARBY] Refreshing transport...")
        
        nearby.stopAdvertising()
        nearby.stopDiscovery()
        
        val endpoints = connectedEndpoints.keys.toList()
        connectedEndpoints.clear()
        for (ep in endpoints) {
            callback?.onDisconnected(ep)
        }
        
        startAdvertising()
        startDiscovery()
    }

    override fun sendPayload(endpointId: String, payload: String) {
        val p = Payload.fromBytes(payload.toByteArray(Charsets.UTF_8))
        nearby.sendPayload(endpointId, p).addOnFailureListener { e ->
            Log.e(TAG, "Failed to send to $endpointId: ${e.localizedMessage}")
        }
    }

    override fun getConnectedEndpoints(): List<String> {
        return connectedEndpoints.keys.toList()
    }

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            Log.i(TAG, "Endpoint discovered: $endpointId (${info.endpointName})")
            callback?.onEndpointDiscovered(endpointId, info.endpointName)

            if (!connectedEndpoints.containsKey(endpointId)) {
                nearby.requestConnection(localNodeId, endpointId, connectionLifecycleCallback)
                    .addOnFailureListener { e ->
                        Log.e(TAG, "requestConnection failed to $endpointId: ${e.localizedMessage}")
                    }
            }
        }

        override fun onEndpointLost(endpointId: String) {
            Log.i(TAG, "Endpoint lost: $endpointId")
            callback?.onEndpointLost(endpointId)
        }
    }

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            Log.i(TAG, "Connection initiated from ${info.endpointName} ($endpointId)")
            callback?.onConnectionInitiated(endpointId, info.endpointName)
            nearby.acceptConnection(endpointId, payloadCallback)
                .addOnFailureListener { e ->
                    Log.e(TAG, "acceptConnection failed: ${e.localizedMessage}")
                }
        }

        override fun onConnectionResult(endpointId: String, resolution: ConnectionResolution) {
            if (resolution.status.isSuccess) {
                Log.i(TAG, "Connection established: $endpointId")
                connectedEndpoints[endpointId] = endpointId
                callback?.onConnectionResult(endpointId, true)
            } else {
                Log.w(TAG, "Connection rejected/failed ($endpointId): ${resolution.status.statusCode}")
                connectedEndpoints.remove(endpointId)
                callback?.onConnectionResult(endpointId, false)
            }
        }

        override fun onDisconnected(endpointId: String) {
            Log.i(TAG, "Disconnected from $endpointId")
            connectedEndpoints.remove(endpointId)
            callback?.onDisconnected(endpointId)
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            if (payload.type != Payload.Type.BYTES) return
            val bytes = payload.asBytes() ?: return
            val json = String(bytes, Charsets.UTF_8)
            callback?.onPayloadReceived(endpointId, json)
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {}
    }
}
