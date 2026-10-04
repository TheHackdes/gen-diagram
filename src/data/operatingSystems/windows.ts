import type { OperatingSystem } from '../../types';

export const WINDOWS_OS: OperatingSystem[] = [
  {
    id: 'windows-server',
    family: 'windows',
    name: 'Windows Server',
    short: 'Win Server',
    icon: 'brand:windows',
    color: '#0078D4',
    usage: 'server',
    vendor: 'Microsoft',
    keywords: ['microsoft', 'active directory', 'ad', 'iis'],
    versions: [
      { id: '2016', label: '2016' },
      { id: '2019', label: '2019', lts: true },
      { id: '2022', label: '2022', lts: true },
      { id: '2025', label: '2025', lts: true },
    ],
  },
  {
    id: 'windows-11',
    family: 'windows',
    name: 'Windows 11',
    short: 'Win 11',
    icon: 'brand:windows',
    color: '#0078D4',
    usage: 'desktop',
    vendor: 'Microsoft',
    keywords: ['microsoft', 'workstation'],
    versions: [
      { id: '23H2', label: '23H2' },
      { id: '24H2', label: '24H2' },
      { id: '25H2', label: '25H2' },
    ],
  },
  {
    id: 'windows-10',
    family: 'windows',
    name: 'Windows 10',
    short: 'Win 10',
    icon: 'brand:windows',
    color: '#0078D4',
    usage: 'desktop',
    vendor: 'Microsoft',
    keywords: ['microsoft', 'workstation'],
    versions: [
      { id: '21H2', label: '21H2' },
      { id: '22H2', label: '22H2' },
      { id: 'ltsc-2021', label: 'LTSC 2021', lts: true },
    ],
  },
];
