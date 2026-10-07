import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../../data/templates';
import { validateDiagram } from '../validation/validate';
import { buildDocument, DOC_SECTIONS } from './document';
import { toHtml, toMarkdown } from './render';

const demo = () => {
  const d = TEMPLATES.find((t) => t.id === 'demo')!.build();
  return { name: 'Acme', description: 'HQ <test>', ...d, issues: validateDiagram(d.nodes, d.edges, d.vlans, d.bonds) };
};
const all = DOC_SECTIONS.map((s) => s.id);

describe('documentation', () => {
  it('builds every requested section, in order', () => {
    const doc = buildDocument(demo(), ['issues', 'summary', 'vlans'], new Date('2026-01-01T10:00:00Z'));
    expect(doc.sections.map((s) => s.id)).toEqual(['summary', 'vlans', 'issues']);
  });

  it('addressing plan lists addresses sorted per VLAN, with usage', () => {
    const doc = buildDocument(demo(), ['addressing'], new Date());
    const t = doc.sections[0].tables.find((x) => x.title?.startsWith('VLAN 20'))!;
    const ips = t.rows.map((r) => r[0]);
    expect(ips.length).toBeGreaterThan(3);
    expect([...ips].sort((a, b) => a.split('.').map(Number).reduce((s, n) => s * 256 + n, 0) - b.split('.').map(Number).reduce((s, n) => s * 256 + n, 0))).toEqual(ips);
    expect(t.note).toMatch(/of 254 host addresses used/);
  });

  it('inventory, links, bonds and rules come from the diagram', () => {
    const doc = buildDocument(demo(), all, new Date());
    const text = JSON.stringify(doc);
    expect(text).toContain('pve-01');
    expect(text).toContain('bond0');
    expect(doc.sections.find((s) => s.id === 'firewall')!.tables.length).toBeGreaterThan(0);
  });

  it('renders Markdown and escaped, self-contained HTML', () => {
    const doc = buildDocument(demo(), all, new Date());
    const md = toMarkdown(doc, 'acme-diagram.png');
    expect(md).toMatch(/^# Acme/);
    expect(md).toContain('![Diagram of Acme](acme-diagram.png)');
    expect(md).toMatch(/\| Address \| Device \| Interface \| Note \|/);
    const html = toHtml(doc, 'data:image/png;base64,AAAA');
    expect(html).toContain('HQ &lt;test&gt;');
    expect(html).not.toContain('<test>');
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(html).not.toMatch(/<script|<link /);
  });
});
