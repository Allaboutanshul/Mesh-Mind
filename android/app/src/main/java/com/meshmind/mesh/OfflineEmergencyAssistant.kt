package com.meshmind.mesh

import java.util.Locale

/**
 * OfflineEmergencyAssistant — On-device emergency knowledge and intent engine.
 *
 * Runs 100% offline without requiring internet, cellular data, cloud APIs, or remote servers.
 * Provides concise, actionable disaster response protocols for high-stress situations.
 */
object OfflineEmergencyAssistant {

    data class EmergencyGuide(
        val id: String,
        val title: String,
        val icon: String,
        val category: String,
        val shortAdvice: String,
        val detailedSteps: List<String>,
        val requiresSosRecommendation: Boolean = true
    )

    data class AssistantResponse(
        val query: String,
        val guide: EmergencyGuide?,
        val summary: String,
        val steps: List<String>,
        val recommendSos: Boolean,
        val isOfflineVerified: Boolean = true
    )

    // Pre-packaged offline disaster emergency knowledge base
    private val GUIDES = listOf(
        EmergencyGuide(
            id = "trapped",
            title = "Trapped Under Debris",
            icon = "🧱",
            category = "Trapped-Person Safety",
            shortAdvice = "Stay calm, protect your airway, tap in rhythm, conserve oxygen.",
            detailedSteps = listOf(
                "Cover your mouth and nose with a cloth or clothing to filter dust.",
                "Avoid shouting unless you hear rescuers nearby — shouting causes dangerous dust inhalation.",
                "Tap loudly in 3-beat rhythms (TAP ... TAP ... TAP) on a pipe, wall, or structure.",
                "Keep movements to a minimum to save energy and slow oxygen consumption.",
                "If bleeding, press available cloth firmly on the wound."
            ),
            requiresSosRecommendation = true
        ),
        EmergencyGuide(
            id = "smoke_fire",
            title = "Fire & Heavy Smoke Inhalation",
            icon = "🔥",
            category = "Fire/Smoke Safety",
            shortAdvice = "Get low under smoke, feel doors for heat, seal room if trapped.",
            detailedSteps = listOf(
                "Crawl low on hands and knees — clean air is closest to the floor.",
                "Cover face with a wet or dry cloth to filter soot and gases.",
                "Touch doors with the back of your hand before opening. If hot, DO NOT OPEN.",
                "If exit is blocked, seal door cracks with wet cloth or tape to block smoke.",
                "Signal from a window with bright cloth or flashlight."
            ),
            requiresSosRecommendation = true
        ),
        EmergencyGuide(
            id = "bleeding",
            title = "Severe Bleeding & Wound Care",
            icon = "🩸",
            category = "Basic First Aid",
            shortAdvice = "Apply direct firm pressure, elevate above heart, do not remove cloth.",
            detailedSteps = listOf(
                "Apply direct, continuous firm pressure on the wound using clean cloth or shirt.",
                "Keep pressing continuously for at least 10–15 minutes without lifting to check.",
                "If blood soaks through, add another cloth layer ON TOP — do NOT remove the first layer.",
                "Elevate the bleeding limb above the level of the heart if no bone fracture is suspected.",
                "Keep the victim warm with clothing/blanket to prevent shock."
            ),
            requiresSosRecommendation = true
        ),
        EmergencyGuide(
            id = "fracture",
            title = "Fractures & Musculoskeletal Injury",
            icon = "🦴",
            category = "First Aid / Injury",
            shortAdvice = "Immobilize area, do not try to realign bone, support joint.",
            detailedSteps = listOf(
                "Do NOT move or attempt to straighten an injured limb or spine.",
                "Immobilize the joint above and below the suspected fracture using cardboard, rolled cloth, or stick.",
                "Apply cold pack or cloth to reduce swelling if available.",
                "Check pulse and skin color below the injury to ensure blood flow."
            ),
            requiresSosRecommendation = true
        ),
        EmergencyGuide(
            id = "earthquake",
            title = "Earthquake Safety",
            icon = "🌊",
            category = "Earthquake Safety",
            shortAdvice = "Drop, Cover, and Hold On. Stay clear of glass and heavy objects.",
            detailedSteps = listOf(
                "DROP onto hands and knees to avoid being knocked over.",
                "COVER head and neck under a sturdy table, desk, or against an interior wall.",
                "HOLD ON to your shelter until shaking completely stops.",
                "After shaking stops, evacuate calmly using stairs — NEVER use elevators.",
                "Expect aftershocks — be prepared to drop and cover again."
            ),
            requiresSosRecommendation = false
        ),
        EmergencyGuide(
            id = "evacuation",
            title = "Evacuation & Safe Exit",
            icon = "🏃",
            category = "Evacuation",
            shortAdvice = "Follow designated routes, avoid structural damage zones, stay clear of power lines.",
            detailedSteps = listOf(
                "Bring emergency kit, phone, and essential water if reachable.",
                "Stay clear of damaged buildings, downed power lines, and unstable trees.",
                "Walk briskly — do NOT run. Help elders, children, and injured.",
                "Proceed to designated open assembly areas (parks, fields, stadium)."
            ),
            requiresSosRecommendation = false
        ),
        EmergencyGuide(
            id = "signal",
            title = "Signaling Rescuers",
            icon = "📣",
            category = "Signalling Rescuers",
            shortAdvice = "Use 3-pattern acoustic or visual signals (whistle, mirror, flash).",
            detailedSteps = listOf(
                "International Distress Signal: 3 short bursts, pause, 3 short bursts.",
                "Use a whistle, metal pipe tapping, or horn — sounds travel further than voices.",
                "At night, flash phone light or mirror repeatedly towards open sky or search teams.",
                "Spread brightly colored cloth or objects on flat high ground for drone/helicopter search."
            ),
            requiresSosRecommendation = false
        ),
        EmergencyGuide(
            id = "water_food",
            title = "Water & Food Conservation",
            icon = "💧",
            category = "Water/Food Conservation",
            shortAdvice = "Sip small amounts, avoid salty foods, ration clean water.",
            detailedSteps = listOf(
                "Ration water intake: sip small amounts throughout the day instead of gulping.",
                "Avoid eating if water is scarce — digestion consumes body water.",
                "Only drink clear, boiled, or disinfected water. Do NOT drink floodwater or salt water.",
                "Keep water containers sealed in shade to prevent contamination."
            ),
            requiresSosRecommendation = false
        ),
        EmergencyGuide(
            id = "battery",
            title = "Battery & Phone Power Conservation",
            icon = "⚡",
            category = "Battery Conservation",
            shortAdvice = "Lower brightness, close extra apps, keep MeshMind running.",
            detailedSteps = listOf(
                "Turn screen brightness to minimum level.",
                "Close background social media or video apps.",
                "Enable Android Power Saver mode.",
                "Keep MeshMind open for offline mesh relay — BLE uses minimal battery.",
                "Avoid unnecessary screen-on time — use screen only when sending/reading messages."
            ),
            requiresSosRecommendation = false
        ),
        EmergencyGuide(
            id = "cpr",
            title = "CPR & Unconscious Victim Care",
            icon = "🏥",
            category = "Basic First Aid",
            shortAdvice = "Check breathing, place in recovery position, deliver firm chest compressions.",
            detailedSteps = listOf(
                "Check responsiveness: tap shoulders and shout loudly.",
                "If unresponsive but breathing normally: turn onto side into Recovery Position.",
                "If not breathing: place hands center of chest, push hard and fast (100–120 beats/min).",
                "Trigger One-Tap SOS immediately for emergency medical team."
            ),
            requiresSosRecommendation = true
        )
    )

    fun getGuideById(id: String): EmergencyGuide? = GUIDES.find { it.id == id }

    fun getAllGuides(): List<EmergencyGuide> = GUIDES

    /**
     * Matches a natural language query or keyword against the offline knowledge base.
     */
    fun query(userQuery: String): AssistantResponse {
        val q = userQuery.lowercase(Locale.getDefault()).trim()

        val matched = when {
            q.contains("debris") || q.contains("trapped") || q.contains("rubble") || q.contains("collapsed") ->
                getGuideById("trapped")

            q.contains("smoke") || q.contains("fire") || q.contains("flame") || q.contains("suffocat") ->
                getGuideById("smoke_fire")

            q.contains("bleed") || q.contains("blood") || q.contains("cut") || q.contains("wound") ->
                getGuideById("bleeding")

            q.contains("fracture") || q.contains("bone") || q.contains("sprain") || q.contains("broken") || q.contains("leg") || q.contains("arm") ->
                getGuideById("fracture")

            q.contains("earthquake") || q.contains("tremor") || q.contains("shak") ->
                getGuideById("earthquake")

            q.contains("exit") || q.contains("evacuat") || q.contains("escape") || q.contains("route") ->
                getGuideById("evacuation")

            q.contains("signal") || q.contains("rescuer") || q.contains("whistle") || q.contains("attract") || q.contains("find me") ->
                getGuideById("signal")

            q.contains("water") || q.contains("food") || q.contains("ration") || q.contains("thirst") ->
                getGuideById("water_food")

            q.contains("battery") || q.contains("power") || q.contains("charge") || q.contains("save phone") ->
                getGuideById("battery")

            q.contains("cpr") || q.contains("unconscious") || q.contains("heart") || q.contains("breath") ->
                getGuideById("cpr")

            else -> null
        }

        if (matched != null) {
            return AssistantResponse(
                query = userQuery,
                guide = matched,
                summary = "${matched.icon} ${matched.title}: ${matched.shortAdvice}",
                steps = matched.detailedSteps,
                recommendSos = matched.requiresSosRecommendation
            )
        }

        // General emergency fallback
        return AssistantResponse(
            query = userQuery,
            guide = null,
            summary = "⚡ Offline General Safety Protocol: Stay calm, protect your physical safety, and broadcast a One-Tap SOS if assistance is required.",
            steps = listOf(
                "If you are in immediate danger or injured, tap ONE-TAP SOS above.",
                "Ensure your immediate surrounding is stable and free from falling hazards.",
                "Keep your phone active on MeshMind so nearby peers can relay your location.",
                "For specific instructions, try terms like: trapped, bleeding, smoke, earthquake, battery, signal."
            ),
            recommendSos = true
        )
    }
}
