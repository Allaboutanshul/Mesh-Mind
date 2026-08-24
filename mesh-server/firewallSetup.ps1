# MeshMind Windows Firewall configuration (Private profile only)
# This script creates inbound rules for the MeshMind UDP and HTTP ports.
# Run with administrative privileges.

$udpPort = 50001
$httpPort = 4001

# Remove existing rules with same names if they exist
Get-NetFirewallRule -DisplayName "MeshMind UDP Inbound" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName "MeshMind HTTP Inbound" -ErrorAction SilentlyContinue | Remove-NetFirewallRule

# Create UDP inbound rule (Private profile)
New-NetFirewallRule -DisplayName "MeshMind UDP Inbound" -Direction Inbound -Protocol UDP -LocalPort $udpPort -Profile Private -Action Allow

# Create HTTP inbound rule (Private profile)
New-NetFirewallRule -DisplayName "MeshMind HTTP Inbound" -Direction Inbound -Protocol TCP -LocalPort $httpPort -Profile Private -Action Allow
