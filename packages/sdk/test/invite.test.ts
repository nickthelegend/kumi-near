import { expect, it } from 'vitest';
import { parseInviteCommand, shareholderTally, type Crew, type Proposal } from '../src/kumi.js';
it('accepts an exact testnet invite command and rejects malformed or mainnet accounts', () => {
  expect(parseInviteCommand('/invite friend.my-relayer.testnet')).toBe('friend.my-relayer.testnet');
  for (const text of ['/invite friend.near', '/invite A.testnet', '/invite -a.testnet', '/invite a..testnet', '/invite a.testnet extra', '/invite']) expect(parseInviteCommand(text)).toBeNull();
});
it('does not count unfunded role members or former holders toward invitation approval', () => {
  const crew = { members: [['alice.testnet', '5'], ['bob.testnet', '5'], ['cy.testnet', '0']] } as Crew;
  const proposal: Proposal = { id: 1, proposer: 'alice.testnet', description: 'Invite cy', status: 'InProgress', kind: {}, vote_counts: {}, submission_time: '0', votes: { 'alice.testnet': 'Approve', 'cy.testnet': 'Approve', 'former.testnet': 'Approve' } };
  expect(shareholderTally(proposal, crew)).toEqual({ approve: 1, reject: 0, needed: 2, members: 2 });
});
