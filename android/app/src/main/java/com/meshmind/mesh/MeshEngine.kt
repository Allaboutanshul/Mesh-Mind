package com.meshmind.mesh

import android.util.Log
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue

class MeshEngine(
    private val localNodeId: String,
    private val onLogMessage: (String) -> Unit,
    private val onForwardToGateway: (String) -> Unit
) : TransportCallback {

    private val TAG = "MeshEngine"
    private var activeTransport: MeshTransport? = null
    
    // Engine State
    private val seenMessageIds = ConcurrentHashMap.newKeySet<String>()
    private val pendingSosQueue = ConcurrentLinkedQueue<MeshMessage>()
    private var connectedPeersCount = 0

    // For UI updates
    var onPeersChanged: ((Int) -> Unit)? = null

    fun setTransport(transport: MeshTransport) {
        activeTransport?.stopAll()
        activeTransport = transport
        transport.setCallback(this)
        transport.startAdvertising()
        transport.startDiscovery()
        connectedPeersCount = 0
        onPeersChanged?.invoke(connectedPeersCount)
    }
    
    fun stop() {
        activeTransport?.stopAll()
    }
    
    fun getConnectedPeersCount(): Int {
        return activeTransport?.getConnectedEndpoints()?.size ?: 0
    }
    
    fun getConnectedEndpoints(): List<String> {
        return activeTransport?.getConnectedEndpoints() ?: emptyList()
    }

    // ── TransportCallback Implementation ──

    override fun onEndpointDiscovered(endpointId: String, endpointName: String) {
        // Handled by Transport internally (or log)
    }

    override fun onEndpointLost(endpointId: String) {}

    override fun onConnectionInitiated(endpointId: String, endpointName: String) {}

    override fun onConnectionResult(endpointId: String, success: Boolean) {
        if (success) {
            updatePeerCount()
            flushPendingSosQueue(endpointId)
        } else {
            updatePeerCount()
        }
    }

    override fun onDisconnected(endpointId: String) {
        updatePeerCount()
    }

    override fun onPayloadReceived(endpointId: String, payload: String) {
        val msg = MeshMessage.fromJson(payload) ?: run {
            Log.w(TAG, "[RECEIVE] Malformed packet from $endpointId")
            return
        }

        Log.i(TAG, "[RECEIVE] messageId=${msg.messageId} sourceNodeId=${msg.sourceNodeId} type=${msg.messageType} hopCount=${msg.hopCount} ttl=${msg.ttl}")
        handleReceivedMessage(endpointId, msg)
    }

    override fun logMessage(message: String) {
        onLogMessage(message)
    }

    private fun updatePeerCount() {
        val count = activeTransport?.getConnectedEndpoints()?.size ?: 0
        if (count != connectedPeersCount) {
            connectedPeersCount = count
            onPeersChanged?.invoke(count)
        }
    }

    // ── Message Routing & Protocol Logic ──

    private fun handleReceivedMessage(fromEndpointId: String, msg: MeshMessage) {
        // 1. Duplicate suppression
        if (!seenMessageIds.add(msg.messageId)) {
            Log.d(TAG, "[DUPLICATE] messageId=${msg.messageId}")
            onLogMessage("[DUPLICATE] ${msg.messageId} (already processed — dropped)")
            return
        }

        // 2. Local delivery
        val isForUs = msg.isBroadcast() || msg.isForMe(localNodeId)
        if (isForUs) {
            val tag = if (msg.messageType == "SOS") "🚨 [EMERGENCY SOS DELIVERED]" else "[DELIVER]"
            Log.i(TAG, "$tag messageId=${msg.messageId} from=${msg.sourceNodeId}")
            onLogMessage("$tag ${msg.messageId}\n  From: ${msg.sourceNodeId} | Hops: ${msg.hopCount} | TTL: ${msg.ttl}\n  Path: ${msg.relayPath}\n  Payload: \"${msg.payload}\"")
        } else {
            onLogMessage("[RECEIVE] ${msg.messageId} from ${msg.sourceNodeId} via $fromEndpointId (hopCount=${msg.hopCount})")
        }

        // 3. Opportunistic Gateway Forwarding
        onForwardToGateway(msg.toJson())

        // 4. Multi-hop relay
        if (msg.ttl <= 1) {
            Log.d(TAG, "[DROP][TTL] messageId=${msg.messageId} ttl=${msg.ttl}")
            onLogMessage("[DROP][TTL] ${msg.messageId} — TTL exhausted")
            return
        }

        val relayedPath = (msg.relayPath + localNodeId).toMutableList()
        val relayed = msg.copy(
            ttl = msg.ttl - 1,
            hopCount = msg.hopCount + 1,
            relayPath = relayedPath
        )
        val jsonPayload = relayed.toJson()

        var relayCount = 0
        val endpoints = activeTransport?.getConnectedEndpoints() ?: emptyList()
        for (epId in endpoints) {
            if (epId == fromEndpointId) continue
            activeTransport?.sendPayload(epId, jsonPayload)
            Log.i(TAG, "[RELAY] messageId=${relayed.messageId} to=$epId hop=${relayed.hopCount} ttl=${relayed.ttl}")
            onLogMessage("[RELAY] ${relayed.messageId} → $epId (hop=${relayed.hopCount}, ttl=${relayed.ttl})\n  path=${relayed.relayPath}")
            relayCount++
        }

        if (relayCount == 0) {
            onLogMessage("[RELAY] ${relayed.messageId} — no other connected peers to relay to")
        }
    }

    // ── Sending Messages (SOS & Text) ──

    fun queueAndBroadcastSos(sosMsg: MeshMessage): Int {
        seenMessageIds.add(sosMsg.messageId)
        val endpoints = activeTransport?.getConnectedEndpoints() ?: emptyList()
        val peerCount = endpoints.size

        if (peerCount > 0) {
            val jsonPayload = sosMsg.toJson()
            for (epId in endpoints) {
                activeTransport?.sendPayload(epId, jsonPayload)
            }
        } else {
            pendingSosQueue.add(sosMsg)
        }
        
        onForwardToGateway(sosMsg.toJson())
        return peerCount
    }

    fun broadcastMessage(msg: MeshMessage): Int {
        seenMessageIds.add(msg.messageId)
        val endpoints = activeTransport?.getConnectedEndpoints() ?: emptyList()
        
        val jsonPayload = msg.toJson()
        var sentCount = 0
        for (epId in endpoints) {
            activeTransport?.sendPayload(epId, jsonPayload)
            sentCount++
        }
        
        onForwardToGateway(jsonPayload)
        return sentCount
    }

    private fun flushPendingSosQueue(endpointId: String) {
        if (pendingSosQueue.isEmpty()) return
        Log.i(TAG, "[STORE-AND-FORWARD] Flushing ${pendingSosQueue.size} pending SOS message(s) to new peer $endpointId")

        var flushedCount = 0
        val iterator = pendingSosQueue.iterator()
        while (iterator.hasNext()) {
            val msg = iterator.next()
            activeTransport?.sendPayload(endpointId, msg.toJson())
            flushedCount++
        }

        val totalPeers = activeTransport?.getConnectedEndpoints()?.size ?: 0
        onLogMessage("📡 [STORE-AND-FORWARD] Auto-transmitted $flushedCount queued SOS message(s) to newly connected peer $endpointId!")
        // SOS status update would be handled by UI via state polling or callback if needed.
    }
}
