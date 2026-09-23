package com.meshmind.mesh

interface MeshTransport {
    fun startAdvertising()
    fun startDiscovery()
    fun refresh()
    fun stopAll()
    fun sendPayload(endpointId: String, payload: String)
    fun getConnectedEndpoints(): List<String>
    fun setCallback(callback: TransportCallback)
}

interface TransportCallback {
    fun onEndpointDiscovered(endpointId: String, endpointName: String)
    fun onEndpointLost(endpointId: String)
    fun onConnectionInitiated(endpointId: String, endpointName: String)
    fun onConnectionResult(endpointId: String, success: Boolean)
    fun onDisconnected(endpointId: String)
    fun onPayloadReceived(endpointId: String, payload: String)
    fun logMessage(message: String)
}
