import { logger } from '../utils/logger';

export interface EntityGraphNode {
  primaryEntity: string;
  aliases: string[];
  subEntities: string[];
  keyPeople: string[];
  relatedTerms: string[];
}

export class EntityGraph {
  private static graphMap: Map<string, EntityGraphNode> = new Map([
    [
      'marvel studios',
      {
        primaryEntity: 'Marvel Studios',
        aliases: ['mcu', 'marvel cinematic universe', 'marvel animation', 'marvel television'],
        subEntities: [
          'avengers',
          'spider-man',
          'x-men',
          'fantastic four',
          'deadpool',
          'wolverine',
          'cyclops',
          'jean grey',
          'thor',
          'captain america',
          'iron man',
          'daredevil',
          'kingpin',
          'doomsday',
          'secret wars',
          'thunderbolts',
          'blade',
          'd23',
        ],
        keyPeople: ['kevin feige', 'sadie sink', 'kit connor', 'ryan reynolds', 'hugh jackman'],
        relatedTerms: ['box office', 'casting', 'trailer', 'teaser', 'release date', 'phase 5', 'phase 6'],
      },
    ],
    [
      'ai security',
      {
        primaryEntity: 'AI Security',
        aliases: ['llm security', 'ai safety', 'machine learning security'],
        subEntities: [
          'prompt injection',
          'jailbreak',
          'adversarial attack',
          'model extraction',
          'data poisoning',
          'agent sandboxing',
          'supply chain attack',
          'garak',
          'pyrit',
          'cve',
          'zero-day',
        ],
        keyPeople: ['dario amodei', 'sam altman', 'yoshua bengio'],
        relatedTerms: ['red teaming', 'alignment', 'vulnerability disclosure', 'mitigation', 'nist'],
      },
    ],
    [
      'system security',
      {
        primaryEntity: 'System Security',
        aliases: ['cybersecurity', 'infosec', 'os security'],
        subEntities: [
          'ebpf',
          'kernel',
          'container escape',
          'runc',
          'containerd',
          'kubernetes',
          'privilege escalation',
          'spectre',
          'meltdown',
          'sbom',
          'cve',
          'zero-trust',
        ],
        keyPeople: ['linus torvalds'],
        relatedTerms: ['exploit', 'vulnerability', 'advisory', 'patch', 'hardening', 'audit'],
      },
    ],
    [
      'openai',
      {
        primaryEntity: 'OpenAI',
        aliases: ['openai research'],
        subEntities: ['gpt-4o', 'gpt-5', 'chatgpt', 'sora', 'codex', 'dall-e', 'o1', 'o3', 'whisper', 'fine-tuning', 'api'],
        keyPeople: ['sam altman', 'greg brockman', 'mira murati', 'ilya sutskever'],
        relatedTerms: ['model release', 'benchmark', 'weights', 'frontier model', 'red team'],
      },
    ],
  ]);

  /**
   * Retrieves all valid entity keywords/aliases for a target domain.
   */
  static getEntityKeywords(domain: string, interests: string[] = []): string[] {
    const domainLower = domain.toLowerCase().trim();
    const keywords = new Set<string>();

    keywords.add(domainLower);

    // Split domain words (e.g. "Marvel Studios" -> "marvel", "studios")
    domainLower.split(/\s+/).forEach((w) => {
      if (w.length > 2) keywords.add(w);
    });

    // Check predefined graph
    for (const [key, node] of this.graphMap.entries()) {
      if (domainLower.includes(key) || key.includes(domainLower)) {
        node.aliases.forEach((a) => keywords.add(a.toLowerCase()));
        node.subEntities.forEach((s) => keywords.add(s.toLowerCase()));
        node.keyPeople.forEach((p) => keywords.add(p.toLowerCase()));
        node.relatedTerms.forEach((r) => keywords.add(r.toLowerCase()));
      }
    }

    // Add interests
    for (const interest of interests) {
      const interestLower = interest.toLowerCase().trim();
      if (interestLower.length > 2) {
        keywords.add(interestLower);
        interestLower.split(/\s+/).forEach((w) => {
          if (w.length > 2) keywords.add(w);
        });
      }
    }

    return Array.from(keywords);
  }
}
