import { Cable, Eye, EyeOff, Plus, Sparkles, X } from 'lucide-react';
import { addressEntries, allIps, defaultInterface, entriesPatch, interfaceName, interfacesOf, subInterface } from '../../features/nodes/ips';
import { suggestIp } from '../../features/nodes/operations';
import { useDiagram } from '../../store/diagramStore';
import type { FieldDef, InfraNode, IpEntry } from '../../types';
import { ipInCidr, isValidIPv4 } from '../../utils/ip';
import { FieldRow, Input, Select } from '../ui/Field';

/**
 * The addresses of a node, all alike: address, interface and VLAN on each
 * line. "Add IP address" proposes an interface, a VLAN and a free address.
 */
export function IpListEditor({ node, field }: { node: InfraNode; field: FieldDef }) {
  const update = useDiagram((s) => s.updateNodeProps);
  const vlans = useDiagram((s) => s.vlans);
  const nodes = useDiagram((s) => s.nodes);
  const edges = useDiagram((s) => s.edges);
  const select = useDiagram((s) => s.select);
  const renameInterface = useDiagram((s) => s.renameInterface);
  const entries = addressEntries(node.data.props);
  // Link plugged into each interface (a VLAN sub-interface rides on its parent's cable).
  const links = new Map(interfacesOf(node, edges).map((i) => [i.name, i.link]));
  const linkOf = (name: string) => links.get(name) ?? links.get(subInterface(name)?.parent ?? '');
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.data.name ?? '?';
  const write = (next: IpEntry[]) => update(node.id, entriesPatch(next));
  const subnetOf = (vlan: string | undefined) => vlans.find((v) => String(v.id) === vlan)?.subnet;

  const add = () => {
    // Propose a VLAN this node has no address in yet, with a free address in it.
    const used = new Set(entries.map((e) => e.vlan ?? ''));
    const vlan = vlans.find((v) => !used.has(String(v.id)) && v.subnet);
    const vlanId = vlan ? String(vlan.id) : '';
    const address = vlan?.subnet ? suggestIp(vlan.subnet, nodes) : '';
    write([...entries, { address, label: defaultInterface(node, entries.length, vlanId), vlan: vlanId, show: true }]);
    setTimeout(() => document.getElementById(`ip-${node.id}-${entries.length}`)?.focus(), 30);
  };

  return (
    <FieldRow label="IP addresses">
      <div className="space-y-1.5">
        {entries.map((r, i) => {
          const subnet = subnetOf(r.vlan);
          const invalid = !!r.address && !isValidIPv4(r.address);
          const outside = !invalid && !!subnet && !!r.address && ipInCidr(r.address, subnet) === false;
          const suggestion = !r.address && subnet ? suggestIp(subnet, nodes) : '';
          const dupOwner = r.address && isValidIPv4(r.address)
            ? nodes.find((n) => n.id !== node.id && allIps(n.data.props).some((e) => e.address === r.address))
            : undefined;
          const dupSelf = !!r.address && entries.some((e, j) => j !== i && e.address === r.address);
          const set = (patch: Partial<IpEntry>) => write(entries.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          const shown = r.show !== false;
          const iface = interfaceName(node, r, i);
          const link = linkOf(iface);
          const sub = subInterface(iface);
          return (
            <div key={i} className="rounded-lg border border-line p-1.5">
              <div className="flex items-center gap-1">
                <Input
                  id={`ip-${node.id}-${i}`}
                  aria-label={`IP address ${i + 1}`}
                  mono
                  invalid={invalid}
                  placeholder={suggestion || field.placeholder || '192.168.10.20'}
                  value={r.address}
                  onChange={(e) => set({ address: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && !e.shiftKey && !r.address && suggestion) set({ address: suggestion });
                  }}
                />
                <button
                  type="button"
                  aria-label={shown ? 'Hide on diagram' : 'Show on diagram'}
                  aria-pressed={shown}
                  title={shown ? 'Shown on the diagram — click to hide' : 'Hidden on the diagram — click to show'}
                  onClick={() => set({ show: !shown })}
                  className={shown ? 'rounded p-1 text-primary' : 'rounded p-1 text-subtle hover:text-fg'}
                >
                  {shown ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button type="button" aria-label="Remove address" onClick={() => write(entries.filter((_, j) => j !== i))} className="rounded p-1 text-subtle hover:text-danger">
                  <X size={13} />
                </button>
              </div>
              <div className="mt-1.5 grid grid-cols-[1fr_1.3fr] gap-1.5">
                <Input
                  aria-label="Interface"
                  mono
                  placeholder={defaultInterface(node, i, r.vlan ?? '')}
                  value={r.label ?? ''}
                  onChange={(e) => {
                    const label = e.target.value;
                    set({ label });
                    // Links plugged into this interface keep pointing to it (unless another address stays on the old name).
                    const shared = entries.some((x, j) => j !== i && interfaceName(node, x, j) === iface);
                    if (!shared) renameInterface(node.id, iface, interfaceName(node, { ...r, label }, i));
                  }}
                  className="h-7 text-[12px]"
                />
                <Select
                  aria-label="VLAN"
                  value={r.vlan ?? ''}
                  onChange={(e) => {
                    const vlan = e.target.value;
                    const next = subnetOf(vlan);
                    // An empty address, or one from another subnet, follows the new VLAN.
                    const keep = !!r.address && (!next || ipInCidr(r.address, next) !== false);
                    set({ vlan, address: keep ? r.address : next ? suggestIp(next, nodes) : r.address });
                  }}
                  className="h-7 text-[12px]"
                >
                  <option value="">No VLAN</option>
                  {vlans.map((v) => (
                    <option key={v.uid} value={String(v.id)}>
                      VLAN {v.id} — {v.name}
                    </option>
                  ))}
                </Select>
              </div>
              {link && (
                <button
                  type="button"
                  onClick={() => select([], [link.edgeId])}
                  className="mt-1 inline-flex max-w-full items-center gap-1 text-[11px] text-muted hover:text-fg"
                  title="Select this link"
                >
                  <Cable size={11} className="shrink-0" />
                  <span className="truncate">
                    {sub ? `via ${sub.parent} ` : ''}↔ {nameOf(link.peer)}
                    {link.peerPort && <span className="font-mono"> · {link.peerPort}</span>}
                  </span>
                </button>
              )}
              {suggestion && (
                <button type="button" onClick={() => set({ address: suggestion })} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                  <Sparkles size={11} /> Use {suggestion}
                </button>
              )}
              {(invalid || outside) && <p className="mt-1 text-[11px] text-danger">{invalid ? 'Invalid IPv4 address' : `Outside VLAN ${r.vlan} (${subnet})`}</p>}
              {(dupOwner || dupSelf) && <p className="mt-1 text-[11px] text-danger">Already used {dupSelf ? 'by another line' : `by ${dupOwner!.data.name}`}</p>}
            </div>
          );
        })}
        <button type="button" onClick={add} className="flex items-center gap-1 text-[12px] font-medium text-primary hover:underline">
          <Plus size={12} /> Add IP address
        </button>
      </div>
    </FieldRow>
  );
}
