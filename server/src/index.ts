import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';
import { createRoutes } from './routes/index.js';
import { setupSocketHandlers } from './socket/handlers.js';
import { MeshSimulationEngine } from './simulation/engine.js';
import { RoutingEngine } from './routing/engine.js';
import { MessageService } from './services/messageService.js';
import { InMemoryStore } from './services/inMemoryStore.js';

dotenv.config();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

async function main() {
  const app = express();
  const httpServer = createServer(app);

  const io = new SocketServer(httpServer, {
    cors: { origin: CLIENT_URL, methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: CLIENT_URL }));
  app.use(express.json());

  const store = new InMemoryStore();
  const simulationEngine = new MeshSimulationEngine(store);
  const routingEngine = new RoutingEngine();
  const messageService = new MessageService(store, routingEngine, io);

  store.seedDefaultData();

  app.use('/api', createRoutes(store, simulationEngine, routingEngine, messageService, io));
  setupSocketHandlers(io, store, simulationEngine, routingEngine, messageService);

  httpServer.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  MESHMIND SERVER`);
    console.log(`  Port: ${PORT}`);
    console.log(`  Database: In-Memory`);
    console.log(`  Client: ${CLIENT_URL}`);
    console.log(`========================================\n`);
  });
}

main().catch(console.error);
