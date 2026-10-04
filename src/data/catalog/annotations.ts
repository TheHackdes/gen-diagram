import type { ComponentDefinition } from '../../types';

const sel = (values: string[]) => values.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));

function annotation(def: Omit<ComponentDefinition, 'kind' | 'category' | 'role' | 'standalone'>): ComponentDefinition {
  return { kind: 'annotation', category: 'annotations', role: 'annotation', standalone: true, ...def };
}

export const ANNOTATIONS: ComponentDefinition[] = [
  annotation({
    type: 'title',
    label: 'Title',
    renderer: 'title',
    icon: 'title',
    description: 'Diagram or section title.',
    keywords: ['heading', 'header'],
    fields: [
      { key: 'text', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
    ],
    defaults: { text: 'Infrastructure overview', subtitle: '' },
    size: { width: 420, height: 64 },
  }),
  annotation({
    type: 'text',
    label: 'Text',
    renderer: 'text',
    icon: 'text',
    description: 'Free text label.',
    keywords: ['label', 'caption', 'comment'],
    fields: [
      { key: 'text', label: 'Text', type: 'textarea' },
      { key: 'size', label: 'Size', type: 'select', options: sel(['small', 'medium', 'large']) },
      { key: 'weight', label: 'Weight', type: 'select', options: sel(['regular', 'bold']) },
    ],
    defaults: { text: 'Label', size: 'medium', weight: 'regular' },
    size: { width: 180, height: 36 },
  }),
  annotation({
    type: 'note',
    label: 'Note',
    renderer: 'note',
    icon: 'note',
    description: 'Sticky note / comment.',
    keywords: ['comment', 'sticky', 'remark', 'todo'],
    fields: [
      { key: 'text', label: 'Text', type: 'textarea' },
      { key: 'tone', label: 'Color', type: 'select', options: sel(['yellow', 'blue', 'green', 'red', 'gray']) },
    ],
    defaults: { text: 'Add a note…', tone: 'yellow' },
    size: { width: 220, height: 120 },
  }),
  annotation({
    type: 'legend',
    label: 'Legend',
    renderer: 'legend',
    icon: 'legend',
    description: 'Automatic legend of VLANs and link types.',
    keywords: ['key', 'caption'],
    fields: [
      { key: 'text', label: 'Title', type: 'text' },
      { key: 'showVlans', label: 'Show VLANs', type: 'boolean' },
      { key: 'showLinks', label: 'Show link types', type: 'boolean' },
    ],
    defaults: { text: 'Legend', showVlans: true, showLinks: true },
    size: { width: 290, height: 260 },
  }),
  annotation({
    type: 'fw-table',
    label: 'Firewall rules table',
    renderer: 'rulesTable',
    icon: 'table',
    description: 'Table of the firewall rules of one device or of the whole diagram.',
    keywords: ['firewall', 'rules', 'acl', 'matrix', 'flows', 'table'],
    fields: [
      { key: 'text', label: 'Title', type: 'text' },
      { key: 'scope', label: 'Equipment', type: 'nodeRef' },
      { key: 'showDisabled', label: 'Include disabled rules', type: 'boolean' },
      { key: 'dock', label: 'Keep on the right of the diagram', type: 'boolean' },
    ],
    defaults: { text: 'Firewall rules', scope: 'all', showDisabled: false, dock: true },
    size: { width: 720, height: 200 },
  }),
  annotation({
    type: 'area',
    label: 'Zone',
    renderer: 'zone',
    icon: 'area',
    description: 'Highlighted area with a title (no network meaning).',
    keywords: ['region', 'box', 'frame', 'section'],
    fields: [{ key: 'description', label: 'Description', type: 'textarea' }],
    size: { width: 400, height: 240 },
    accepts: '*',
  }),
  annotation({
    type: 'arrow',
    label: 'Arrow',
    renderer: 'arrow',
    icon: 'arrow',
    description: 'Free arrow to point at something.',
    keywords: ['pointer', 'direction', 'flow'],
    fields: [
      { key: 'text', label: 'Label', type: 'text' },
      { key: 'direction', label: 'Direction', type: 'select', options: sel(['right', 'left', 'up', 'down']) },
    ],
    defaults: { text: '', direction: 'right' },
    size: { width: 160, height: 40 },
  }),
  annotation({
    type: 'separator',
    label: 'Separator',
    renderer: 'separator',
    icon: 'separator',
    description: 'Horizontal or vertical divider.',
    keywords: ['divider', 'line', 'rule'],
    fields: [
      { key: 'text', label: 'Label', type: 'text' },
      { key: 'orientation', label: 'Orientation', type: 'select', options: sel(['horizontal', 'vertical']) },
    ],
    defaults: { text: '', orientation: 'horizontal' },
    size: { width: 480, height: 24 },
  }),
];
