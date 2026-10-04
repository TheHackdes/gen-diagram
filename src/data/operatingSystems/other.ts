import type { OperatingSystem } from '../../types';

export const OTHER_OS: OperatingSystem[] = [
  {
    id: 'freebsd',
    family: 'bsd',
    name: 'FreeBSD',
    short: 'FreeBSD',
    icon: 'brand:freebsd',
    color: '#AB2B28',
    usage: 'server',
    versions: [
      { id: '14.3', label: '14.3' },
      { id: '15.0', label: '15.0' },
    ],
  },
  {
    id: 'macos',
    family: 'macos',
    name: 'macOS',
    short: 'macOS',
    icon: 'brand:apple',
    color: '#555555',
    usage: 'desktop',
    vendor: 'Apple',
    versions: [
      { id: '15', label: '15 Sequoia' },
      { id: '26', label: '26 Tahoe' },
    ],
  },
];
