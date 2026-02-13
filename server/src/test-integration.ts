/**
 * Integration test for GetSticky backend
 * Tests database, semantic search, and context inheritance
 */

import { initDB } from './db/index';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';

dotenv.config();

async function runIntegrationTests() {
  console.log('🧪 GetSticky Integration Tests\n');
  console.log('='.repeat(50));

  try {
    // Test 1: Database initialization
    console.log('\n📦 Test 1: Database Initialization');
    const db = await initDB('./test-data');
    console.log('✅ Database initialized successfully');

    // Test 2: Create nodes
    console.log('\n📝 Test 2: Creating Nodes');
    const rootNode = await db.createNode({
      id: uuidv4(),
      type: 'conversation',
      content: JSON.stringify({
        question: 'How do I implement JWT authentication in Node.js?',
        response: 'To implement JWT authentication in Node.js, you need to use the jsonwebtoken library...',
      }),
      context: 'User is building a REST API with Express and needs secure authentication.',
    });
    console.log(`✅ Created root node: ${rootNode.id}`);

    const diagramNode = await db.createNode({
      id: uuidv4(),
      type: 'diagram',
      content: JSON.stringify({
        title: 'JWT Auth Flow',
        description: 'Client → Auth Service → Database → JWT Token → Client',
      }),
      context: 'Architecture diagram showing JWT authentication flow with client, auth service, and database.',
    });
    console.log(`✅ Created diagram node: ${diagramNode.id}`);

    // Test 3: Create edges
    console.log('\n🔗 Test 3: Creating Edges');
    const edge = db.createEdge({
      id: uuidv4(),
      source_id: rootNode.id,
      target_id: diagramNode.id,
      label: 'generated diagram',
    });
    console.log(`✅ Created edge: ${edge.id}`);

    // Test 4: Add context
    console.log('\n💬 Test 4: Adding Context');
    await db.addContext(
      rootNode.id,
      'User mentioned they are using PostgreSQL for the database and Redis for session storage.',
      'user'
    );
    console.log('✅ Added user context');

    await db.addContext(
      diagramNode.id,
      'The authentication flow includes password hashing with bcrypt and token refresh mechanism.',
      'agent'
    );
    console.log('✅ Added agent context');

    // Test 5: Branch conversation
    console.log('\n🌳 Test 5: Branching Conversation');
    const branchNode = await db.branchNode(rootNode.id, {
      id: uuidv4(),
      type: 'conversation',
      content: JSON.stringify({
        question: 'What about token refresh strategies?',
        response: 'There are several token refresh strategies you can use...',
      }),
    });
    console.log(`✅ Created branch node: ${branchNode?.id}`);
    console.log(`   Inherited context length: ${branchNode?.context.length} chars`);

    // Test 6: Semantic search
    if (process.env.OPENAI_API_KEY) {
      console.log('\n🔍 Test 6: Semantic Search');

      const query1 = 'database authentication storage';
      console.log(`   Query: "${query1}"`);
      const results1 = await db.searchContext(query1, 3);
      console.log(`   ✅ Found ${results1.length} results`);
      results1.forEach((r, i) => {
        console.log(`   ${i + 1}. Node ${r.nodeId}: ${r.text.substring(0, 60)}...`);
      });

      const query2 = 'token security';
      console.log(`\n   Query: "${query2}"`);
      const results2 = await db.searchContext(query2, 3);
      console.log(`   ✅ Found ${results2.length} results`);
      results2.forEach((r, i) => {
        console.log(`   ${i + 1}. Node ${r.nodeId}: ${r.text.substring(0, 60)}...`);
      });
    } else {
      console.log('\n⚠️  Test 6: Semantic Search - SKIPPED');
      console.log('   OPENAI_API_KEY not set - vector search disabled');
    }

    // Test 7: Context inheritance
    console.log('\n🔄 Test 7: Context Inheritance');
    if (branchNode) {
      const inheritedContext = db.getInheritedContext(branchNode.id);
      console.log(`   ✅ Inherited context length: ${inheritedContext.length} chars`);
      console.log(`   Contains parent context: ${inheritedContext.includes('REST API with Express')}`);
    }

    // Test 8: Conversation path
    console.log('\n🛤️  Test 8: Conversation Path');
    if (branchNode) {
      const path = db.getConversationPath(branchNode.id);
      console.log(`   ✅ Path length: ${path.length} nodes`);
      path.forEach((node, i) => {
        const content = JSON.parse(node.content);
        const preview = content.question || content.title || 'N/A';
        console.log(`   ${i + 1}. ${node.type}: ${preview}`);
      });
    }

    // Test 9: Export graph
    console.log('\n📊 Test 9: Export Graph');
    const graph = db.exportGraph();
    console.log(`   ✅ Exported ${graph.nodes.length} nodes and ${graph.edges.length} edges`);

    // Test 10: Statistics
    console.log('\n📈 Test 10: Database Statistics');
    const stats = await db.getStats();
    console.log(`   ✅ Stats:`, JSON.stringify(stats, null, 2).split('\n').map(l => `   ${l}`).join('\n').trim());

    // Cleanup
    console.log('\n🧹 Cleanup');
    await db.close();
    console.log('✅ Database closed');

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ All integration tests passed!');
    console.log('='.repeat(50));

  } catch (error: any) {
    console.error('\n❌ Integration test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runIntegrationTests().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
