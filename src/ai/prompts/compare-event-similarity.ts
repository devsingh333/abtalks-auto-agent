export interface EventSimilarityResult {
  isDuplicate: boolean;
  duplicateOfTitle?: string;
  reason: string;
}

export function buildCompareEventSimilarityPrompt(
  candidateTitle: string,
  publishedTitles: string[]
): string {
  return `
You are the Final Anti-Collision Gate for an autonomous publishing system.

TASK:
Determine if the Candidate Topic below represents the SAME core news story or event as ANY of the Previously Published Post Titles.

CANDIDATE TOPIC GOING TO PUBLISH:
"${candidateTitle}"

PREVIOUSLY PUBLISHED POST TITLES (LAST 20 POSTS):
${publishedTitles.length > 0 ? publishedTitles.map((t, idx) => `${idx + 1}. "${t}"`).join('\n') : '(No previous posts)'}

CRITERIA FOR DUPLICATE EVENT (isDuplicate = true):
- The candidate topic reports on the SAME person, casting announcement, product release, or vulnerability disclosure as a previously published post (even if reported by a different news outlet or worded differently).
- Example: "Kit Connor cast as Cyclops in X-Men" vs "LA Times: Kit Connor in talks for Cyclops" = DUPLICATE (true).
- Example: "Sadie Sink Jean Grey update" vs "Sadie Sink filming timeline" = NOT DUPLICATE (false) UNLESS they refer to the exact same specific quote.

Return strictly a JSON object matching this schema:
{
  "isDuplicate": true or false,
  "duplicateOfTitle": "The previously published title that matches (if isDuplicate is true)",
  "reason": "Brief 1-sentence diagnostic explanation of your evaluation"
}
`;
}
