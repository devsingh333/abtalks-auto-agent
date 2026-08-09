import { AgentRepository, PersonaConfig } from '../database/repositories/agent-repository';
import { PostRepository } from '../database/repositories/post-repository';
import { MemoryService } from '../memory/memory-service';
import { autonomousWorker } from './autonomous-worker';
import { InitAgentRequest, InitAgentResponse, AgentFeedResponse } from './agent-types';
import { logger } from '../utils/logger';
import { prisma } from '../database/client';

export class AgentManager {
  static async initializeAgent(req: InitAgentRequest): Promise<InitAgentResponse> {
    const { name, domain } = req.persona;

    logger.info('Received agent initialization request', { name, domain });

    // Expand persona specification
    const personaConfig: PersonaConfig = {
      name,
      role: req.persona.role || `${name} (${domain})`,
      domain,
      identity: req.persona.identity || `${name} is an analytical specialist in ${domain}.`,
      interests: req.persona.interests || [domain, 'technical vulnerability research', 'system architecture', 'infrastructure security'],
      avoid: req.persona.avoid || ['generic AI hype', 'unsubstantiated claims', 'marketing announcements'],
      editorialPrinciples: req.persona.editorialPrinciples || [
        'Prefer primary technical disclosures',
        'Require verified source evidence',
        'Analytical stance over product hype',
      ],
      voice: {
        tone: req.persona.voice?.tone || 'technical and analytical',
        length: req.persona.voice?.length || 'concise',
        style: req.persona.voice?.style || 'evidence-driven',
        stance: req.persona.voice?.stance || 'Evidence-based technical perspective',
      },
    };

    // Check if existing agent with same name and domain exists
    const existing = await AgentRepository.findByNameAndDomain(name, domain);
    if (existing) {
      logger.info('Existing agent found during init call; updating persona & triggering immediate cycle', {
        agentId: existing.id,
        name,
        domain,
      });

      // Re-activate agent if paused & update personaConfig
      await prisma.agent.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          personaConfig: JSON.stringify(personaConfig),
        },
      });

      // Seed/refresh memory in Breeth
      await MemoryService.seedPersonaMemory(existing.id, personaConfig);

      // Start worker & trigger cycle immediately
      await autonomousWorker.startWorkerForAgent(existing.id);
      autonomousWorker.executeCycle(existing.id).catch((err) => {
        logger.error('Error in initial cycle for existing agent', { agentId: existing.id }, err);
      });

      return { agentId: existing.id };
    }

    // Create new Agent record in database
    const newAgent = await AgentRepository.createAgent(name, domain, personaConfig);

    // Seed long-term memory in Breeth
    await MemoryService.seedPersonaMemory(newAgent.id, personaConfig);

    // Start autonomous background worker loop
    await autonomousWorker.startWorkerForAgent(newAgent.id);

    // Trigger immediate discovery & publishing cycle fire-and-forget
    autonomousWorker.executeCycle(newAgent.id).catch((err) => {
      logger.error('Error in initial cycle for new agent', { agentId: newAgent.id }, err);
    });

    logger.info('Successfully initialized agent and started autonomous worker cycle', {
      agentId: newAgent.id,
      name,
      domain,
    });

    return { agentId: newAgent.id };
  }

  static async getAgentFeed(agentId: string): Promise<AgentFeedResponse> {
    const posts = await PostRepository.getPostsByAgent(agentId, 50);

    const formattedPosts = posts.map((p) => ({
      id: p.id,
      createdAt: p.createdAt.toISOString(),
      text: p.text,
      rationale: p.rationale,
      sources: p.sources.map((s: { url: string }) => s.url),
    }));

    return { posts: formattedPosts };
  }
}
