package com.meshmind.mesh

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.RadioGroup
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.UUID
import kotlin.random.Random

/**
 * MeshMind – offline emergency mesh node & disaster response engine.
 */
class MainActivity : AppCompatActivity() {

    // ── constants ──────────────────────────────────────────────────────────────
    private val TAG = "MeshMind"

    // ── views ──────────────────────────────────────────────────────────────────
    private lateinit var localNodeIdText: TextView
    private lateinit var deviceNameText: TextView
    private lateinit var statusText: TextView
    private lateinit var permissionBannerText: TextView
    private lateinit var connectedNodesText: TextView
    private lateinit var messageInput: EditText
    private lateinit var sendButton: Button
    private lateinit var refreshButton: Button
    private lateinit var messageLogText: TextView
    private lateinit var transportRadioGroup: RadioGroup

    private lateinit var gatewayIpInput: EditText
    private lateinit var btnSaveGateway: Button

    // One-Tap SOS
    private lateinit var sosButton: Button
    private lateinit var sosStatusText: TextView
    private lateinit var sosDetailsText: TextView

    // Offline Assistant Views
    private lateinit var assistantQueryInput: EditText
    private lateinit var assistantAskButton: Button
    private lateinit var assistantResponseSummaryText: TextView
    private lateinit var assistantResponseStepsText: TextView
    private lateinit var btnQuickTrapped: Button
    private lateinit var btnQuickSmoke: Button
    private lateinit var btnQuickBleeding: Button
    private lateinit var btnQuickEarthquake: Button
    private lateinit var btnQuickBattery: Button
    private lateinit var btnQuickSignal: Button

    // ── mesh state ─────────────────────────────────────────────────────────────
    private lateinit var localNodeId: String
    private var isMeshRunning = false

    private lateinit var meshEngine: MeshEngine
    private lateinit var nearbyTransport: NearbyTransport
    private lateinit var bluetoothTransport: BluetoothTransport
    private var currentTransportName = "NEARBY_AUTO"

    // ── optional PC gateway & ESP32 BLE Gateway ────────────────────────────────
    private var udpSocket: DatagramSocket? = null
    private val bleGatewayManager by lazy { BleGatewayManager(this) }

    // ── permission launcher ────────────────────────────────────────────────────
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.all { it.value }
        if (allGranted) {
            permissionBannerText.visibility = View.GONE
            startMeshNode()
        } else {
            permissionBannerText.visibility = View.VISIBLE
            permissionBannerText.text =
                "⚠ Permission denied – Bluetooth/Location required for P2P mesh radio"
            statusText.text = "Status: Permissions missing"
            logUi("⚠ One or more required permissions were denied. Mesh cannot start.")
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  Lifecycle
    // ══════════════════════════════════════════════════════════════════════════

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        localNodeId = getOrCreateNodeId()

        localNodeIdText      = findViewById(R.id.localNodeIdText)
        deviceNameText       = findViewById(R.id.deviceNameText)
        statusText           = findViewById(R.id.statusText)
        permissionBannerText = findViewById(R.id.permissionBannerText)
        connectedNodesText   = findViewById(R.id.connectedNodesText)
        messageInput         = findViewById(R.id.messageInput)
        sendButton           = findViewById(R.id.sendButton)
        refreshButton        = findViewById(R.id.refreshButton)
        messageLogText       = findViewById(R.id.messageLogText)
        transportRadioGroup  = findViewById(R.id.transportRadioGroup)

        gatewayIpInput       = findViewById(R.id.gatewayIpInput)
        btnSaveGateway       = findViewById(R.id.btnSaveGateway)

        val prefs = getSharedPreferences("meshmind_prefs", Context.MODE_PRIVATE)
        gatewayIpInput.setText(prefs.getString("gateway_ip", "10.123.222.54"))

        btnSaveGateway.setOnClickListener {
            val ip = gatewayIpInput.text.toString().trim()
            if (android.util.Patterns.IP_ADDRESS.matcher(ip).matches()) {
                prefs.edit().putString("gateway_ip", ip).apply()
                Toast.makeText(this, "Gateway IP saved: $ip", Toast.LENGTH_SHORT).show()
                Log.i(TAG, "[GATEWAY CONFIG] IP=$ip")
                logUi("Gateway IP set to: $ip")
            } else {
                Toast.makeText(this, "Invalid IPv4 address", Toast.LENGTH_SHORT).show()
            }
        }

        // One-Tap SOS
        sosButton      = findViewById(R.id.sosButton)
        sosStatusText  = findViewById(R.id.sosStatusText)
        sosDetailsText = findViewById(R.id.sosDetailsText)

        // Offline Assistant
        assistantQueryInput         = findViewById(R.id.assistantQueryInput)
        assistantAskButton          = findViewById(R.id.assistantAskButton)
        assistantResponseSummaryText= findViewById(R.id.assistantResponseSummaryText)
        assistantResponseStepsText  = findViewById(R.id.assistantResponseStepsText)

        btnQuickTrapped   = findViewById(R.id.btnQuickTrapped)
        btnQuickSmoke     = findViewById(R.id.btnQuickSmoke)
        btnQuickBleeding  = findViewById(R.id.btnQuickBleeding)
        btnQuickEarthquake= findViewById(R.id.btnQuickEarthquake)
        btnQuickBattery   = findViewById(R.id.btnQuickBattery)
        btnQuickSignal    = findViewById(R.id.btnQuickSignal)

        deviceNameText.text = Build.MODEL
        localNodeIdText.text = localNodeId

        refreshButton.setOnClickListener {
            if (isMeshRunning) {
                if (currentTransportName == "NEARBY_AUTO") {
                    nearbyTransport.refresh()
                } else {
                    bluetoothTransport.refresh()
                }
            }
        }

        // Engine & Transports
        meshEngine = MeshEngine(
            localNodeId = localNodeId,
            onLogMessage = { logUi(it) },
            onForwardToGateway = { tryForwardToUdpGateway(it) }
        )
        meshEngine.onPeersChanged = { count ->
            runOnUiThread {
                statusText.text = "Transport: $currentTransportName | Connection: ${if(count>0)"CONNECTED" else "DISCONNECTED"} | Peers: $count"
                val endpoints = meshEngine.getConnectedEndpoints()
                connectedNodesText.text = if (endpoints.isEmpty()) {
                    "No MeshMind nodes found nearby"
                } else {
                    endpoints.joinToString("\n") { "• $it\n  Available" }
                }
            }
        }

        nearbyTransport = NearbyTransport(this, localNodeId)
        bluetoothTransport = BluetoothTransport(this, localNodeId)

        transportRadioGroup.setOnCheckedChangeListener { _, checkedId ->
            if (!isMeshRunning) return@setOnCheckedChangeListener
            
            if (checkedId == R.id.radioNearby) {
                logUi("🔄 Switching transport to Nearby Connections")
                currentTransportName = "NEARBY_AUTO"
                meshEngine.setTransport(nearbyTransport)
            } else if (checkedId == R.id.radioBluetooth) {
                logUi("🔄 Switching transport to Bluetooth Classic (Strict)")
                currentTransportName = "BLUETOOTH_CLASSIC"
                meshEngine.setTransport(bluetoothTransport)
            }
            refreshStatusBar(0)
        }

        // Set up Listeners
        setupSosListener()
        setupAssistantListeners()

        sendButton.setOnClickListener {
            val text = messageInput.text.toString().trim()
            if (text.isNotEmpty()) {
                broadcastEmergencyMessage(text)
                messageInput.setText("")
            }
        }

        initUdpSocket()
        checkAndRequestPermissions()

        val testReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    "com.meshmind.mesh.TRIGGER_SOS" -> {
                        logUi("🚨 Test Intent: Triggering One-Tap SOS Broadcast")
                        triggerOneTapSos()
                    }
                    "com.meshmind.mesh.SEND_TEST_MESSAGE" -> {
                        val text = intent.getStringExtra("text") ?: "Real Message from Phone A"
                        logUi("📡 Test Intent: Broadcasting message \"$text\"")
                        broadcastEmergencyMessage(text)
                    }
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction("com.meshmind.mesh.TRIGGER_SOS")
            addAction("com.meshmind.mesh.SEND_TEST_MESSAGE")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(testReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(testReceiver, filter)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        meshEngine.stop()
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  FEATURE 1: ONE-TAP EMERGENCY SOS
    // ══════════════════════════════════════════════════════════════════════════

    private fun setupSosListener() {
        sosButton.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("🚨 Confirm Emergency SOS")
                .setMessage("Broadcasting an SOS will alert all nearby mesh nodes and rescue hubs with your Node ID ($localNodeId) and location.\n\nAre you sure?")
                .setPositiveButton("BROADCAST SOS NOW") { _, _ ->
                    triggerOneTapSos()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }

    private fun triggerOneTapSos() {
        val location = getOfflineLocation()
        val locStr = if (location != null) {
            "Lat: ${"%.4f".format(location.latitude)}, Lng: ${"%.4f".format(location.longitude)}"
        } else {
            "Location: GPS unavailable (offline)"
        }

        val msgId = "SOS-${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(4)}"
        val sosMsg = MeshMessage(
            messageId         = msgId,
            sourceNodeId      = localNodeId,
            destinationNodeId = MeshMessage.BROADCAST,
            messageType       = "SOS",
            payload           = "🚨 EMERGENCY SOS BROADCAST from $localNodeId [$locStr]",
            timestamp         = System.currentTimeMillis(),
            ttl               = 5,
            hopCount          = 0,
            relayPath         = mutableListOf(localNodeId),
            locationLat       = location?.latitude,
            locationLng       = location?.longitude,
            locationStr       = locStr,
            priority          = "P1",
            displayName       = Build.MODEL,
            transport         = currentTransportName
        )

        sosDetailsText.text = "ID: $msgId | $locStr"
        Log.d(TAG, "[TX] messageId=${sosMsg.messageId}")
        Log.d(TAG, "[TX] gateway=UDP")
        Log.d(TAG, "[TX] bytes=${sosMsg.toJson().toByteArray(Charsets.UTF_8).size}")
        
        val sentCount = meshEngine.queueAndBroadcastSos(sosMsg)
        
        if (sentCount > 0) {
            sosStatusText.text = "SOS Status: ✅ SOS RELAYED ($sentCount connected peers)"
            logUi("🚨 [ONE-TAP SOS] SOS $msgId created and RELAYED to $sentCount connected peers!")
        } else {
            sosStatusText.text = "SOS Status: ⚠ SOS QUEUED (0 connected peers)"
            logUi("🚨 [ONE-TAP SOS] SOS $msgId created. ⚠ No peers connected — SOS QUEUED for store-and-forward auto-transmission.")
        }
    }

    private fun getOfflineLocation(): Location? {
        return try {
            val locManager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                val gpsLoc = locManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                val netLoc = locManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                val pasLoc = locManager.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER)

                val locs = listOfNotNull(gpsLoc, netLoc, pasLoc)
                locs.maxByOrNull { it.time }
            } else null
        } catch (e: Exception) {
            null
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  FEATURE 2: OFFLINE AI EMERGENCY ASSISTANT
    // ══════════════════════════════════════════════════════════════════════════

    private fun setupAssistantListeners() {
        btnQuickTrapped.setOnClickListener { displayAssistantGuide("trapped") }
        btnQuickSmoke.setOnClickListener { displayAssistantGuide("smoke_fire") }
        btnQuickBleeding.setOnClickListener { displayAssistantGuide("bleeding") }
        btnQuickEarthquake.setOnClickListener { displayAssistantGuide("earthquake") }
        btnQuickBattery.setOnClickListener { displayAssistantGuide("battery") }
        btnQuickSignal.setOnClickListener { displayAssistantGuide("signal") }

        assistantAskButton.setOnClickListener {
            val q = assistantQueryInput.text.toString().trim()
            if (q.isNotEmpty()) {
                val resp = OfflineEmergencyAssistant.query(q)
                renderAssistantResponse(resp)
                assistantQueryInput.setText("")
            }
        }
    }

    private fun displayAssistantGuide(id: String) {
        val guide = OfflineEmergencyAssistant.getGuideById(id)
        if (guide != null) {
            val resp = OfflineEmergencyAssistant.AssistantResponse(
                query = guide.title,
                guide = guide,
                summary = "${guide.icon} ${guide.title}: ${guide.shortAdvice}",
                steps = guide.detailedSteps,
                recommendSos = guide.requiresSosRecommendation
            )
            renderAssistantResponse(resp)
        }
    }

    private fun renderAssistantResponse(resp: OfflineEmergencyAssistant.AssistantResponse) {
        assistantResponseSummaryText.text = resp.summary

        val stepsFormatted = resp.steps.joinToString("\n\n") { "• $it" }
        val sosWarning = if (resp.recommendSos) {
            "\n\n🚨 If you are in immediate danger or injured, tap ONE-TAP EMERGENCY SOS above to request help."
        } else ""

        assistantResponseStepsText.text = stepsFormatted + sosWarning
        logUi("💡 [OFFLINE ASSISTANT] Rendered protocol for: \"${resp.query}\"")
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  Node ID & Permissions
    // ══════════════════════════════════════════════════════════════════════════

    private fun getOrCreateNodeId(): String {
        val prefs = getSharedPreferences("meshmind_prefs", Context.MODE_PRIVATE)
        var nodeId = prefs.getString("node_id", null)
        if (nodeId == null) {
            val chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
            val suffix = (1..4).map { chars[Random.nextInt(chars.length)] }.joinToString("")
            nodeId = "NODE-$suffix"
            prefs.edit().putString("node_id", nodeId).apply()
        }
        return nodeId
    }

    private fun checkAndRequestPermissions() {
        val required = mutableListOf<String>()

        required += Manifest.permission.ACCESS_FINE_LOCATION
        required += Manifest.permission.ACCESS_COARSE_LOCATION

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            required += Manifest.permission.BLUETOOTH_SCAN
            required += Manifest.permission.BLUETOOTH_CONNECT
            required += Manifest.permission.BLUETOOTH_ADVERTISE
        } else {
            required += Manifest.permission.BLUETOOTH
            required += Manifest.permission.BLUETOOTH_ADMIN
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            required += Manifest.permission.NEARBY_WIFI_DEVICES
        }

        val missing = required.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isEmpty()) {
            permissionBannerText.visibility = View.GONE
            startMeshNode()
        } else {
            permissionLauncher.launch(missing.toTypedArray())
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  Mesh Start
    // ══════════════════════════════════════════════════════════════════════════

    private fun startMeshNode() {
        if (isMeshRunning) return
        isMeshRunning = true
        
        statusText.text = "Status: Starting Transports…"
        
        // Start selected transport
        if (transportRadioGroup.checkedRadioButtonId == R.id.radioBluetooth) {
            currentTransportName = "BLUETOOTH_CLASSIC"
            meshEngine.setTransport(bluetoothTransport)
        } else {
            currentTransportName = "NEARBY_AUTO"
            meshEngine.setTransport(nearbyTransport)
        }
        
        bleGatewayManager.startScanningAndConnect()
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  Payload Sending
    // ══════════════════════════════════════════════════════════════════════════

    private fun broadcastEmergencyMessage(text: String) {
        val location = getOfflineLocation()
        val locStr = if (location != null) {
            "Lat: ${"%.4f".format(location.latitude)}, Lng: ${"%.4f".format(location.longitude)}"
        } else null

        val msg = MeshMessage(
            sourceNodeId      = localNodeId,
            destinationNodeId = MeshMessage.BROADCAST,
            messageType       = "TEXT",
            payload           = text,
            ttl               = 5,
            hopCount          = 0,
            relayPath         = mutableListOf(localNodeId),
            locationLat       = location?.latitude,
            locationLng       = location?.longitude,
            locationStr       = locStr,
            displayName       = Build.MODEL,
            transport         = currentTransportName
        )

        val locInfo = if (locStr != null) " | $locStr" else ""
        logUi("[SEND] ${msg.messageId}$locInfo\n  Broadcast text: \"$text\"")
        Log.d(TAG, "[TX] messageId=${msg.messageId}")
        Log.d(TAG, "[TX] gateway=UDP")
        Log.d(TAG, "[TX] bytes=${msg.toJson().toByteArray(Charsets.UTF_8).size}")

        val sentCount = meshEngine.broadcastMessage(msg)
        if (sentCount == 0) {
            logUi("⚠ No connected peers — text message logged locally")
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PC Gateway (UDP 50001)
    // ══════════════════════════════════════════════════════════════════════════

    private fun initUdpSocket() {
        Thread {
            try {
                udpSocket = DatagramSocket().also { it.broadcast = true }
                Log.d(TAG, "[GATEWAY] UDP socket ready")
            } catch (e: Exception) {
                Log.w(TAG, "[GATEWAY] UDP socket init failed: ${e.localizedMessage}")
            }
        }.start()
    }

    private fun tryForwardToUdpGateway(jsonPacket: String) {
        Thread {
            try {
                bleGatewayManager.sendMeshMessage(jsonPacket)

                val prefs = getSharedPreferences("meshmind_prefs", Context.MODE_PRIVATE)
                val configuredIp = prefs.getString("gateway_ip", "10.123.222.54") ?: "10.123.222.54"
                
                var messageId = "unknown"
                var sourceNodeId = "unknown"
                try {
                    val jsonObj = org.json.JSONObject(jsonPacket)
                    messageId = jsonObj.optString("messageId", "unknown")
                    sourceNodeId = jsonObj.optString("sourceNodeId", "unknown")
                } catch (e: Exception) {}

                Log.d(TAG, "[ANDROID TX]\nmessageId=$messageId\nsourceNodeId=$sourceNodeId\ngatewayIp=$configuredIp\ngatewayPort=50001\ntransport=UDP")

                val bytes = jsonPacket.toByteArray(Charsets.UTF_8)
                val targets = listOf(configuredIp, "255.255.255.255")
                for (ip in targets) {
                    try {
                        Log.d(TAG, "[UDP GATEWAY]\nsend() called\ntarget=$ip:50001\nbytes=${bytes.size}")
                        val addr = InetAddress.getByName(ip)
                        udpSocket?.send(DatagramPacket(bytes, bytes.size, addr, 50001))
                        Log.d(TAG, "[UDP GATEWAY]\nsend() successful")
                    } catch (e: Exception) {
                        Log.e(TAG, "[UDP GATEWAY]\nsend() FAILED\nerror=${e.message ?: "unknown error"}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "[UDP GATEWAY] overall forward failed: ${e.message}")
            }
        }.start()
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  UI Helpers
    // ══════════════════════════════════════════════════════════════════════════

    private fun refreshStatusBar(count: Int) {
        runOnUiThread {
            statusText.text = "Transport: $currentTransportName | Connection: ${if(count>0)"CONNECTED" else "DISCONNECTED"} | Peers: $count"
        }
    }

    private fun logUi(entry: String) {
        runOnUiThread {
            val ts = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())
                .format(java.util.Date())
            val current = messageLogText.text.toString()
            messageLogText.text = "[$ts] $entry\n\n$current"
        }
    }
}
