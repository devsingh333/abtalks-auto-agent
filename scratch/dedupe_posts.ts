import { prisma } from '../src/database/client';

async function dedupePosts() {
  console.log('Deduplicating existing posts in database...');
  const allPosts = await prisma.post.findMany({
    orderBy: { createdAt: 'asc' },
  });

  const seenTopicIds = new Set<string>();
  const duplicateIdsToDelete: string[] = [];

  for (const post of allPosts) {
    if (seenTopicIds.has(post.topicId)) {
      duplicateIdsToDelete.push(post.id);
    } else {
      seenTopicIds.add(post.topicId);
    }
  }

  if (duplicateIdsToDelete.length > 0) {
    console.log(`Deleting ${duplicateIdsToDelete.length} duplicate post rows...`);
    await prisma.post.deleteMany({
      where: {
        id: { in: duplicateIdsToDelete },
      },
    });
    console.log('Duplicate posts deleted successfully!');
  } else {
    console.log('No duplicate posts found.');
  }

  await prisma.$disconnect();
}

dedupePosts().catch(console.error);
