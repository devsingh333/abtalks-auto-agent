import { AgentManager } from '../src/agents/agent-manager';
import { autonomousWorker } from '../src/agents/autonomous-worker';
import { geminiClient } from '../src/ai/gemini-client';
import { breethClient } from '../src/memory/breeth-client';
import { logger } from '../src/utils/logger';

async function runLiveTest() {
  console.log('=== STARTING LIVE API KEYS INTEGRATION TEST ===\n');

  // 1. Test Gemini API
  console.log('[1/4] Testing Google Gemini API connection...');
  try {
    const geminiResult = await geminiClient.generateStructuredJson(
      'Respond with a JSON object: {"status": "ok", "message": "Gemini API connected successfully"}',
      () => ({ status: 'fallback', message: 'Fallback used' })
    );
    console.log('✔ Gemini API Response:', JSON.stringify(geminiResult, null, 2));
  } catch (err) {
    console.error('✖ Gemini API Error:', err);
  }

  console.log('\n[2/4] Testing Breeth REST Memory API connection...');
  try {
    const memoryRecord = await breethClient.storeMemory('test_agent_001', {
      agentId: 'test_agent_001',
      category: 'persona',
      content: 'Live API test memory record for Ada AI Security agent.',
      metadata: { test: true },
    });
    console.log('✔ Breeth Memory Stored:', JSON.stringify(memoryRecord, null, 2));
  } catch (err) {
    console.error('✖ Breeth Memory Error:', err);
  }

  // 3. Initialize Agent
  console.log('\n[3/4] Initializing Agent "Ada"...');
  const initResult = await AgentManager.initializeAgent({
    persona: {
      name: 'Ada',
      domain: 'AI Security',
    },
  });
  console.log('✔ Agent Initialized. Agent ID:', initResult.agentId);

  // 4. Run Autonomous Cycle
  console.log('\n[4/4] Executing Autonomous Worker Cycle (Discovery -> Evaluation -> Generation -> Feed)...');
  await autonomousWorker.executeCycle(initResult.agentId);

  // Stop worker interval after test
  await autonomousWorker.stopWorkerForAgent(initResult.agentId);

  // 5. Query Feed
  console.log('\n=== QUERYING AGENT FEED RESULT ===');
  const feed = await AgentManager.getAgentFeed(initResult.agentId);
  console.log(`Total Posts in Feed: ${feed.posts.length}`);
  console.log(JSON.stringify(feed, null, 2));

  console.log('\n=== LIVE TEST COMPLETE ===');
  process.exit(0);
}

runLiveTest().catch((err) => {
  console.error('Live Test Failed:', err);
  process.exit(1);
});
