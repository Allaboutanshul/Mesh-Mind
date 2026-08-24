import { useStore } from '../store/useStore';
import { getTransport } from './transport';
import type { TimelineEvent } from '../types';

let running = false;
let timers: ReturnType<typeof setTimeout>[] = [];

function findNodeByName(name: string): string | null {
  return useStore.getState().nodes.find(n => n.name === name)?.id ?? null;
}

function pushTimeline(event: Omit<TimelineEvent, 'status' | 'icon'> & { icon?: string }): void {
  useStore.getState().addTimelineEvent({ ...event, icon: event.icon || 'info', status: 'completed', timestamp: Date.now() });
}

function markTimeline(id: string, status: TimelineEvent['status']): void {
  const store = useStore.getState();
  store.setTimeline(store.timeline.map(t => (t.id === id ? { ...t, status } : t)));
}

export function isDemoRunning(): boolean {
  return running;
}

export function startDemo(): void {
  stopDemo();
  const transport = getTransport();
  if (!transport) return;
  running = true;

  const store = useStore.getState();
  store.setSimulationRunning(true);
  store.setTimeline([]);

  const seed = (id: string, title: string, description: string, type: TimelineEvent['type']) => {
    store.addTimelineEvent({ id, title, description, type, icon: 'info', status: 'pending', timestamp: Date.now() });
  };
  seed('normal', 'Normal mesh operation', 'All nodes online. Internet and cellular available.', 'success');
  seed('internet', 'Internet connection lost', 'Primary internet backbone goes down.', 'warning');
  seed('cellular', 'Cellular network unavailable', 'Cell towers offline - mesh takes over.', 'warning');
  seed('mesh', 'Mesh activated', 'Devices communicate peer-to-peer over the mesh.', 'success');
  seed('nodefail', 'Node failure detected', 'Volunteer A relay drops offline.', 'critical');
  seed('partition', 'Network partition detected', 'Victim zone isolated from Command Center.', 'critical');
  seed('sos', 'SOS generated', 'P1 emergency message created. Destination unreachable - message stored.', 'critical');
  seed('recover', 'Route recalculated', 'Partition resolved - store-and-forward retry initiated.', 'success');
  seed('delivered', 'Emergency delivered', 'SOS acknowledged by Command Center.', 'success');

  transport.reset();
  transport.setNetworkStatus({ internetAvailable: true, cellularAvailable: true });

  const schedule = (delay: number, fn: () => void) => {
    timers.push(setTimeout(() => { if (running) fn(); }, delay));
  };

  schedule(600, () => markTimeline('normal', 'completed'));

  schedule(10000, () => {
    transport.setNetworkStatus({ internetAvailable: false });
    markTimeline('internet', 'completed');
  });

  schedule(20000, () => {
    transport.setNetworkStatus({ cellularAvailable: false });
    markTimeline('cellular', 'completed');
    markTimeline('mesh', 'completed');
  });

  schedule(30000, () => {
    const id = findNodeByName('Volunteer A');
    if (id) transport.disableNode(id);
    markTimeline('nodefail', 'completed');
  });

  schedule(40000, () => {
    const citizen = findNodeByName('Citizen A');
    const volunteerB = findNodeByName('Volunteer B');
    if (citizen) transport.disableNode(citizen);
    if (volunteerB) transport.disableNode(volunteerB);
    markTimeline('partition', 'completed');
  });

  schedule(45000, () => {
    const victim = findNodeByName('Victim');
    const command = findNodeByName('Command Center');
    if (victim && command) {
      transport.sendMessage({
        senderId: victim,
        receiverId: command,
        type: 'SOS',
        priority: 'P1',
        content: 'EMERGENCY: Victim trapped at sector E - immediate assistance required.',
        description: '90-second demo SOS',
      });
    }
    markTimeline('sos', 'completed');
  });

  schedule(55000, () => {
    const citizen = findNodeByName('Citizen A');
    const volunteerB = findNodeByName('Volunteer B');
    if (citizen) transport.enableNode(citizen);
    if (volunteerB) transport.enableNode(volunteerB);
    transport.retryStored();
    markTimeline('recover', 'completed');
  });

  schedule(70000, () => {
    pushTimeline({ id: 'done', title: 'Demo complete', description: 'Full disaster scenario demonstrated.', type: 'success', timestamp: Date.now() });
    markTimeline('delivered', 'completed');
    store.setSimulationRunning(false);
    running = false;
  });
}

export function stopDemo(): void {
  running = false;
  timers.forEach(clearTimeout);
  timers = [];
  useStore.getState().setSimulationRunning(false);
}
