import { getDefinition } from '../../data/catalog';
import { suggestIp } from '../../features/nodes/operations';
import { zoneSubnet } from '../../features/validation/validate';
import type { FieldDef, InfraNode, Vlan } from '../../types';
import { firstHost } from '../../utils/ip';
import { str } from '../../utils/misc';

/** Context-aware value suggestions displayed next to empty fields. */
export function suggestionFor(field: FieldDef, node: InfraNode, vlans: Vlan[], nodes: InfraNode[]): string | undefined {
  const vlan = vlans.find((v) => String(v.id) === str(node.data.props.vlan));
  const parent = node.parentId ? nodes.find((n) => n.id === node.parentId) : undefined;
  const parentSubnet = parent && getDefinition(parent.data.type).kind === 'zone' ? zoneSubnet(parent, vlans) : '';
  const subnet = str(node.data.props.network) || vlan?.subnet || parentSubnet;
  switch (field.key) {
    case 'ip':
      return subnet ? suggestIp(subnet, nodes) || undefined : undefined;
    case 'gateway':
      return vlan?.gateway || (subnet ? firstHost(subnet) ?? undefined : undefined);
    case 'network':
      return vlan?.subnet || parentSubnet || undefined;
    case 'hostname':
      return node.data.name ? `${node.data.name}.local` : undefined;
    case 'subnet':
      return vlan?.subnet || undefined;
    case 'bridge':
      return parent && getDefinition(parent.data.type).role === 'hypervisor' ? 'vmbr0' : undefined;
    default:
      return undefined;
  }
}
