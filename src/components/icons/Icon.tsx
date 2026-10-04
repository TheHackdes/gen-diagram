import type { LucideIcon } from 'lucide-react';
import {
  AppWindow,
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  Box,
  Building,
  Cable,
  Cctv,
  Cloud,
  Container,
  Cpu,
  Database,
  FingerprintPattern,
  Globe,
  Group,
  HardDrive,
  Heading,
  KeyRound,
  Laptop,
  Layers,
  Lightbulb,
  ListTree,
  Lock,
  Minus,
  Monitor,
  Network,
  Phone,
  Printer,
  Radar,
  Router,
  Scale,
  Server,
  ServerCog,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldHalf,
  Smartphone,
  SquareDashed,
  StickyNote,
  Tag,
  Type,
  User,
  Users,
  Waypoints,
  Wifi,
  Workflow,
  Archive,
  Split,
  Radio,
  Layers2,
  PanelsTopLeft,
} from 'lucide-react';
import { BRANDS } from './brands';

export const LUCIDE_ICONS: Record<string, LucideIcon> = {
  router: Router,
  switch: Network,
  'l3-switch': Layers,
  firewall: Shield,
  'load-balancer': Scale,
  'access-point': Wifi,
  vpn: KeyRound,
  internet: Globe,
  cloud: Cloud,
  wan: Waypoints,
  lan: Cable,
  server: Server,
  'rack-server': ServerCog,
  blade: Layers2,
  nas: HardDrive,
  san: Archive,
  storage: Database,
  database: Database,
  web: AppWindow,
  app: Boxes,
  dns: ListTree,
  dhcp: Radio,
  vm: Monitor,
  lxc: Box,
  container: Container,
  bridge: Split,
  ids: Radar,
  ips: ShieldAlert,
  waf: ShieldHalf,
  'reverse-proxy': ArrowLeftRight,
  bastion: Lock,
  auth: FingerprintPattern,
  shield: ShieldCheck,
  vlan: Tag,
  subnet: Workflow,
  network: Network,
  dmz: Shield,
  pc: Monitor,
  laptop: Laptop,
  printer: Printer,
  phone: Phone,
  smartphone: Smartphone,
  iot: Lightbulb,
  camera: Cctv,
  device: Cpu,
  user: User,
  users: Users,
  group: Group,
  note: StickyNote,
  text: Type,
  title: Heading,
  legend: PanelsTopLeft,
  separator: Minus,
  arrow: ArrowRight,
  area: SquareDashed,
  building: Building,
};

interface IconProps {
  /** "lucide-key" or "brand:key". */
  name: string;
  size?: number;
  className?: string;
  /** For brand icons: use the brand color instead of currentColor. */
  brandColor?: boolean;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, className, brandColor = false, strokeWidth = 1.75 }: IconProps) {
  if (name.startsWith('brand:')) {
    const mark = BRANDS[name.slice(6)];
    if (mark) {
      return (
        <svg
          viewBox={mark.viewBox ?? '0 0 24 24'}
          width={size}
          height={size}
          className={className}
          fill={brandColor ? mark.color : 'currentColor'}
          aria-hidden="true"
        >
          <path d={mark.path} />
        </svg>
      );
    }
  }
  const Cmp = LUCIDE_ICONS[name] ?? Cpu;
  return <Cmp size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}

export function brandColorOf(name: string): string | undefined {
  return name.startsWith('brand:') ? BRANDS[name.slice(6)]?.color : undefined;
}
