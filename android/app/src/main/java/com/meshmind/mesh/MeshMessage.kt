package com.meshmind.mesh

import com.google.gson.Gson
import java.util.UUID

/**
 * MeshMessage — the canonical packet that travels through the offline Nearby Connections mesh.
 *
 * Fields must never be removed; they are part of the on-wire format shared across all nodes.
 */
data class MeshMessage(
    val messageId: String = "MSG-${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(4)}",
    val sourceNodeId: String,
    val destinationNodeId: String = BROADCAST,
    val messageType: String = "EMERGENCY",
    val payload: String,
    val timestamp: Long = System.currentTimeMillis(),
    var ttl: Int = 5,
    var hopCount: Int = 0,
    val relayPath: MutableList<String> = mutableListOf(sourceNodeId),
    val locationLat: Double? = null,
    val locationLng: Double? = null,
    val locationStr: String? = null,
    val priority: String = "P1",
    val displayName: String? = null,
    val transport: String? = null
) {
    fun toJson(): String = Gson().toJson(this)

    /** Returns true when this node is the intended final destination of the packet. */
    fun isForMe(localNodeId: String): Boolean =
        destinationNodeId == localNodeId

    /** Returns true for a broadcast packet that every node should deliver AND relay. */
    fun isBroadcast(): Boolean = destinationNodeId == BROADCAST

    companion object {
        const val BROADCAST = "BROADCAST"

        fun fromJson(json: String): MeshMessage? = try {
            Gson().fromJson(json, MeshMessage::class.java)
        } catch (e: Exception) {
            null
        }
    }
}
