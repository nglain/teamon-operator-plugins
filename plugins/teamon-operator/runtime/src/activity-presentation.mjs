// Source-only episodes, not a semantic classifier or execution ledger.
// Self-contained so this same tested function can be embedded in the MCP App.
export function activityEpisodes(input) {
  const groups = new Map(), seen = new Set();
  const timestamp = m => typeof m.ts === 'string' && Number.isFinite(Date.parse(m.ts)) ? Date.parse(m.ts) : null;
  for (const m of input) {
    if (!m.sessionKey || !m.agentId || m.id === undefined || m.id === null || !['user','assistant'].includes(m.role)) continue;
    const group = JSON.stringify([m.sessionKey,m.agentId,String(m.userId)]);
    const key = JSON.stringify([group,String(m.id)]);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!groups.has(group)) groups.set(group,[]);
    groups.get(group).push(m);
  }
  const episodes = [];
  for (const [group,rows] of groups) {
    rows.sort((a,b)=>(timestamp(a) ?? Infinity) - (timestamp(b) ?? Infinity));
    let current;
    for (const m of rows) {
      // Unknown dates cannot establish a relationship to a neighbouring turn.
      if (!current || timestamp(m) === null || current.undated || m.role === 'user') {
        current = { id:JSON.stringify([group,String(m.id)]), sessionKey:m.sessionKey, agentId:m.agentId,
          userId:m.userId, userName:m.userName, username:m.username, channel:m.channel,
          title:m.role === 'user' ? m.preview || '[Без текстового содержимого]' : 'Начало обращения не попало в выборку',
          requestMissing:m.role !== 'user', provisional:true, acceptance:'not_checked',
          messages:[], messageIds:[], userMessages:0, agentMessages:0, undated:timestamp(m) === null };
        episodes.push(current);
      }
      current.messages.push(m);
      if (m.messageId !== undefined && m.messageId !== null) current.messageIds.push(m.messageId);
      if (m.role === 'user') current.userMessages++; else current.agentMessages++;
    }
  }
  for (const e of episodes) {
    const first = e.messages[0], last = e.messages.at(-1);
    e.startedAt = first.ts; e.lastActive = last.ts;
    e.elapsedMs = e.messages.length > 1 && timestamp(first) !== null && timestamp(last) !== null
      ? timestamp(last)-timestamp(first) : null;
    e.outcome = e.agentMessages ? 'response_observed' : 'response_not_observed';
  }
  return episodes.sort((a,b)=>(timestamp({ts:b.lastActive}) ?? -Infinity)-(timestamp({ts:a.lastActive}) ?? -Infinity));
}
