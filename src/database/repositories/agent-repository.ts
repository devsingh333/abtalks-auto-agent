import { prisma } from '../client';
import { Agent } from '@prisma/client';

export interface PersonaConfig {
  name: string;
  role?: string;
  domain: string;
  identity: string;
  interests: string[];
  avoid: string[];
  editorialPrinciples: string[];
  voice: {
    tone: string;
    length: string;
    style: string;
    stance?: string;
  };
}

export class AgentRepository {
  static async createAgent(name: string, domain: string, personaConfig: PersonaConfig): Promise<Agent> {
    return prisma.agent.create({
      data: {
        name,
        domain,
        personaConfig: JSON.stringify(personaConfig),
        status: 'active',
      },
    });
  }

  static async findById(id: string): Promise<Agent | null> {
    return prisma.agent.findUnique({
      where: { id },
    });
  }

  static async findByNameAndDomain(name: string, domain: string): Promise<Agent | null> {
    return prisma.agent.findFirst({
      where: { name, domain },
    });
  }

  static async listActiveAgents(): Promise<Agent[]> {
    return prisma.agent.findMany({
      where: { status: 'active' },
    });
  }

  static async listAllAgents(): Promise<Agent[]> {
    return prisma.agent.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  static async updateStatus(id: string, status: string): Promise<Agent> {
    return prisma.agent.update({
      where: { id },
      data: { status },
    });
  }

  static async deleteAgent(id: string): Promise<void> {
    await prisma.agent.delete({
      where: { id },
    });
  }
}
