import { insertRule, newRule, rulesOf } from '../../../features/firewall/rules';
import { allIps } from '../../../features/nodes/ips';
import { useDiagram } from '../../../store/diagramStore';
import type { FirewallRule, InfraNode } from '../../../types';

/** Rules of a node with editing helpers (each change is one undo step). */
export function useRules(node: InfraNode) {
  const update = useDiagram((s) => s.updateNodeProps);
  const rules = rulesOf(node.data.props);
  const write = (next: FirewallRule[]) => update(node.id, { fwRules: next });
  // A host firewall protects the host itself: new rules target it by default.
  const defaultDestination = node.data.props.fw === true ? (allIps(node.data.props)[0]?.address ?? 'any') : 'any';
  return {
    rules,
    add: (partial: Partial<FirewallRule> = {}): FirewallRule => {
      const rule = newRule({ destination: defaultDestination, ...partial });
      write(insertRule(rules, rule));
      return rule;
    },
    change: (id: string, patch: Partial<FirewallRule>) => write(rules.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    move: (id: string, delta: number) => {
      const i = rules.findIndex((r) => r.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= rules.length) return;
      const next = rules.slice();
      [next[i], next[j]] = [next[j], next[i]];
      write(next);
    },
    remove: (id: string) => write(rules.filter((r) => r.id !== id)),
  };
}
