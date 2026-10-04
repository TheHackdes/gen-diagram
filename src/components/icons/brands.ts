import {
  siAlmalinux,
  siAlpinelinux,
  siArchlinux,
  siCentos,
  siCloudflare,
  siDebian,
  siDocker,
  siFedora,
  siFreebsd,
  siGooglecloud,
  siKubernetes,
  siLinux,
  siLinuxcontainers,
  siOpensuse,
  siOpnsense,
  siPfsense,
  siProxmox,
  siQemu,
  siRedhat,
  siRockylinux,
  siSuse,
  siTruenas,
  siUbuntu,
  siVmware,
  siApple,
} from 'simple-icons';

export interface BrandMark {
  path: string;
  /** Color used when the mark is drawn in brand color. */
  color: string;
  viewBox?: string;
}

const WINDOWS_PATH =
  'M0 3.45 9.75 2.1v9.4H0zm10.95-1.5L24 0v11.4H10.95zM0 12.6h9.75v9.45L0 20.7zm10.95 0H24V24l-13.05-1.85z';
const AZURE_PATH =
  'M5.48 21.1 12.1 3h4.96L9.73 21.1zm6.97-4.1 4.63-5.5 6.42 9.6H11.7l3.7-.73-2.95-3.37zM0 21.1l4.1-7.1 3.1 3.6-1.4 3.5z';
const AWS_PATH =
  'M6.8 10.6c0 .3 0 .5.1.7l.2.5c0 .1.1.1.1.2l-.1.2-.5.3h-.2l-.2-.1-.3-.4-.3-.5c-.7.8-1.6 1.3-2.7 1.3-.8 0-1.4-.2-1.9-.7-.4-.4-.7-1-.7-1.8s.3-1.4.8-1.9 1.3-.7 2.2-.7l.9.1 1 .2v-.6c0-.6-.1-1.1-.4-1.3-.3-.3-.8-.4-1.4-.4l-1 .1-1 .3-.3.1h-.2c-.1 0-.2-.1-.2-.2v-.5l.1-.3.3-.2 1.1-.4 1.4-.2c1 0 1.8.2 2.3.7s.7 1.2.7 2.2zM3.2 12c.3 0 .6-.1 1-.2.3-.1.6-.3.9-.6l.3-.6.1-.8v-.4l-.8-.2-.8-.1c-.6 0-1 .1-1.3.3s-.4.6-.4 1c0 .5.1.8.3 1 .2.4.5.6.7.6m6.9.9-.3-.1-.1-.3L7.6 6l-.1-.3c0-.1.1-.2.2-.2h1c.2 0 .3 0 .3.1l.2.3 1.4 5.6 1.3-5.6.1-.3.3-.1h.8c.2 0 .3 0 .3.1l.2.3 1.3 5.7 1.4-5.7.2-.3.3-.1h.9c.1 0 .2.1.2.2v.3l-2 6.4-.2.3-.3.1h-.8c-.2 0-.3 0-.3-.1l-.2-.3-1.3-5.4-1.3 5.4-.2.3-.3.1zm12.5.3c-.5 0-1-.1-1.5-.2l-1.1-.4-.2-.3v-.5c0-.2.1-.3.2-.3h.3l.3.1 1 .3 1 .1c.5 0 1-.1 1.2-.3.3-.2.4-.5.4-.8s-.1-.4-.3-.6-.5-.3-1-.5l-1.4-.4c-.7-.2-1.2-.6-1.6-1-.3-.4-.5-.9-.5-1.4s.1-.8.3-1.1.4-.6.7-.8l1-.5 1.2-.2h.6l.6.1.6.2.4.2.3.2.1.3v.5c0 .2-.1.3-.2.3l-.4-.1c-.5-.2-1.1-.3-1.7-.3-.5 0-.9.1-1.1.2-.3.2-.4.4-.4.8 0 .2.1.5.3.6.2.2.6.4 1.1.5l1.4.4c.7.2 1.2.5 1.5.9s.5.9.5 1.4c0 .4-.1.8-.2 1.2-.2.3-.4.6-.7.9-.3.2-.7.4-1.1.5zm1.8 4.7c-3.3 2.4-8 3.7-12.1 3.7-5.7 0-10.9-2.1-14.8-5.6-.3-.3 0-.7.3-.4 4.2 2.5 9.4 3.9 14.8 3.9 3.6 0 7.6-.8 11.3-2.3.5-.3 1 .3.5.7m1.3-1.5c-.4-.5-2.8-.3-3.9-.1-.3 0-.4-.3-.1-.5 1.9-1.4 5.1-1 5.5-.5s-.1 3.7-1.9 5.3c-.3.2-.5.1-.4-.2.4-1.1 1.3-3.5.8-4';

export const BRANDS: Record<string, BrandMark> = {
  debian: { path: siDebian.path, color: '#A81D33' },
  ubuntu: { path: siUbuntu.path, color: '#E95420' },
  redhat: { path: siRedhat.path, color: '#EE0000' },
  rocky: { path: siRockylinux.path, color: '#10B981' },
  alma: { path: siAlmalinux.path, color: '#0F4266' },
  fedora: { path: siFedora.path, color: '#51A2DA' },
  centos: { path: siCentos.path, color: '#932279' },
  arch: { path: siArchlinux.path, color: '#1793D1' },
  suse: { path: siSuse.path, color: '#30BA78' },
  opensuse: { path: siOpensuse.path, color: '#73BA25' },
  alpine: { path: siAlpinelinux.path, color: '#0D597F' },
  linux: { path: siLinux.path, color: '#B88A00' },
  freebsd: { path: siFreebsd.path, color: '#AB2B28' },
  windows: { path: WINDOWS_PATH, color: '#0078D4' },
  apple: { path: siApple.path, color: '#555555' },
  proxmox: { path: siProxmox.path, color: '#E57000' },
  vmware: { path: siVmware.path, color: '#607078' },
  qemu: { path: siQemu.path, color: '#FF6600' },
  lxc: { path: siLinuxcontainers.path, color: '#333333' },
  docker: { path: siDocker.path, color: '#2496ED' },
  kubernetes: { path: siKubernetes.path, color: '#326CE5' },
  cloudflare: { path: siCloudflare.path, color: '#F38020' },
  gcp: { path: siGooglecloud.path, color: '#4285F4' },
  aws: { path: AWS_PATH, color: '#FF9900' },
  azure: { path: AZURE_PATH, color: '#0078D4' },
  opnsense: { path: siOpnsense.path, color: '#E44A20' },
  pfsense: { path: siPfsense.path, color: '#212121' },
  truenas: { path: siTruenas.path, color: '#0095D5' },
};
