import { Plus, X } from 'lucide-react';
import { extraIps } from '../../features/nodes/ips';
import { suggestIp } from '../../features/nodes/operations';
import { useDiagram } from '../../store/diagramStore';
import type { InfraNode, IpEntry } from '../../types';
import { ipInCidr, isValidIPv4 } from '../../utils/ip';
import { str } from '../../utils/misc';
import { Input, Select } from '../ui/Field';

/** Additional addresses of a multi-homed node (management, backup, storage networks…). */
export function IpListEditor({ node }: { node: InfraNode }) {
  const update = useDiagram((s) => s.updateNodeProps);
  const vlans = useDiagram((s) => s.vlans);
  const nodes = useDiagram((s) => s.nodes);
  const rows = extraIps(node.data.props);
  const write = (next: IpEntry[]) => update(node.id, { ips: next });

  const addRow = () => {
    // Suggest an address on a VLAN not used yet by this node.
    const used = new Set([str(node.data.props.vlan), ...rows.map((r) => r.vlan ?? '')]);
    const vlan = vlans.find((v) => !used.has(String(v.id)) && v.subnet);
    write([...rows, { address: vlan?.subnet ? suggestIp(vlan.subnet, nodes) : '', label: `eth${rows.length + 1}`, vlan: vlan ? String(vlan.id) : '' }]);
  };

  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const vlan = vlans.find((v) => String(v.id) === r.vlan);
        const invalid = !!r.address && !isValidIPv4(r.address);
        const outside = !invalid && !!vlan?.subnet && !!r.address && ipInCidr(r.address, vlan.subnet) === false;
        const set = (patch: Partial<IpEntry>) => write(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
          <div key={i} className="rounded-lg border border-line p-1.5">
            <div className="flex items-center gap-1.5">
              <Input
                aria-label={`Additional IP ${i + 1}`}
                mono
                invalid={invalid}
                placeholder="10.0.99.10"
                value={r.address}
                onChange={(e) => set({ address: e.target.value })}
              />
              <button type="button" aria-label="Remove address" onClick={() => write(rows.filter((_, j) => j !== i))} className="rounded p-1 text-subtle hover:text-danger">
                <X size={13} />
              </button>
            </div>
            <div className="mt-1.5 grid grid-cols-[1fr_1.3fr] gap-1.5 pr-6">
              <Input aria-label="Interface / label" placeholder="eth1, mgmt…" value={r.label ?? ''} onChange={(e) => set({ label: e.target.value })} className="h-7 text-[12px]" />
              <Select aria-label="VLAN" value={r.vlan ?? ''} onChange={(e) => set({ vlan: e.target.value })} className="h-7 text-[12px]">
                <option value="">No VLAN</option>
                {vlans.map((v) => (
                  <option key={v.uid} value={String(v.id)}>
                    VLAN {v.id} — {v.name}
                  </option>
                ))}
              </Select>
            </div>
            {(invalid || outside) && (
              <p className="mt-1 text-[11px] text-danger">{invalid ? 'Invalid IPv4 address' : `Outside VLAN ${vlan?.id} (${vlan?.subnet})`}</p>
            )}
          </div>
        );
      })}
      <button type="button" onClick={addRow} className="flex items-center gap-1 text-[12px] font-medium text-primary hover:underline">
        <Plus size={12} /> Add IP address
      </button>
    </div>
  );
}
