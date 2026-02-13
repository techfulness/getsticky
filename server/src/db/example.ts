/**
 * Example usage of the database layer
 * Run with: npm run dev
 */

import { initDB } from './index';
import { v4 as uuidv4 } from 'uuid';

async function example() {
  console.log('Initializing database...');
  const db = await initDB('./test-data');

  console.log('\n=== Creating nodes ===');

  // Create a root conversation node
  const rootNode = await db.createNode({
    id: uuidv4(),
    type: 'conversation',
    content: JSON.stringify({
      question: 'How do I implement authentication in my app?',
      response: 'I can help you implement authentication. Let me explain the common approaches...',
    }),
    context: 'User is building a web application and needs authentication. They are using React and Node.js.',
  });
  console.log('Created root node:', rootNode.id);

  // Create a branched conversation node
  const branchNode = await db.branchNode(rootNode.id, {
    id: uuidv4(),
    type: 'conversation',
    content: JSON.stringify({
      question: 'What about JWT tokens?',
      response: 'JWT tokens are a great choice for stateless authentication...',
    }),
  });
  console.log('Created branch node:', branchNode?.id);

  // Create a diagram node (diagrams are native React Flow nodes + edges on the canvas)
  const diagramNode = await db.createNode({
    id: uuidv4(),
    type: 'diagram',
    content: JSON.stringify({
      title: 'Auth Flow',
      description: 'Client → Auth Service → JWT Token + User Database',
    }),
    context: 'Architecture diagram showing authentication flow with JWT tokens and user database.',
  });
  console.log('Created diagram node:', diagramNode.id);

  // Create edge between nodes
  const edge = db.createEdge({
    id: uuidv4(),
    source_id: rootNode.id,
    target_id: diagramNode.id,
    label: 'generated diagram',
  });
  console.log('Created edge:', edge.id);

  console.log('\n=== Adding context ===');
  await db.addContext(
    rootNode.id,
    'User mentioned they are using PostgreSQL for the database',
    'user'
  );
  console.log('Added context to root node');

  console.log('\n=== Semantic search ===');
  const searchResults = await db.searchContext('database authentication storage', 3);
  console.log('Search results for "database authentication storage":');
  searchResults.forEach((result, i) => {
    console.log(`${i + 1}. Node: ${result.nodeId}`);
    console.log(`   Text: ${result.text.substring(0, 100)}...`);
    console.log(`   Source: ${result.source}`);
  });

  console.log('\n=== Getting conversation path ===');
  if (branchNode) {
    const path = db.getConversationPath(branchNode.id);
    console.log('Conversation path:');
    path.forEach((node, i) => {
      const content = JSON.parse(node.content);
      console.log(`${i + 1}. ${node.type}: ${content.question || content.title || 'N/A'}`);
    });
  }

  console.log('\n=== Database stats ===');
  const stats = await db.getStats();
  console.log('Stats:', JSON.stringify(stats, null, 2));

  console.log('\n=== Export graph ===');
  const graph = db.exportGraph();
  console.log(`Exported ${graph.nodes.length} nodes and ${graph.edges.length} edges`);

  await db.close();
  console.log('\nDatabase closed.');
}

// Run example if this file is executed directly
if (require.main === module) {
  example().catch(console.error);
}
