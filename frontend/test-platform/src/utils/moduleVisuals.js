/**
 * Icon + colour for a test module, so a module looks the same in the picker,
 * the run summary and anywhere else it is listed.
 */
import {
  BadgeCheck, Bell, Database, FileCode2, FileText, FlaskConical, Layers, Leaf, Lock, Megaphone, MoreHorizontal,
  Puzzle, RefreshCcw, Route, Settings2, ShoppingCart, Stethoscope, Store, Tag, UserPlus, Users,
} from 'lucide-react';

const MODULE_ICONS = [
  [/login|auth|sign/i, Lock, '#16a34a'],
  [/onboard|register|signup/i, UserPlus, '#6366f1'],
  [/crop|health|leaf|farm/i, Leaf, '#059669'],
  [/broadcast|notification|message/i, Megaphone, '#ec4899'],
  [/field|farmer|update/i, Users, '#f97316'],
  [/diagnos|disease|analysis/i, Stethoscope, '#2563eb'],
  [/market|shop|store/i, Store, '#0ea5e9'],
  [/cart|order|checkout/i, ShoppingCart, '#f59e0b'],
  [/alert|remind/i, Bell, '#db2777'],
  [/scheme|report|document/i, FileText, '#7c3aed'],
  [/dashboard|home|overview/i, Layers, '#0891b2'],
  [/other|misc/i, MoreHorizontal, '#64748b'],
];

export function moduleVisual(name = '') {
  const match = MODULE_ICONS.find(([pattern]) => pattern.test(name));
  return { Icon: match?.[1] || FileCode2, color: match?.[2] || '#475569' };
}

/**
 * Icon per test type, for the type pickers in Web Testing and Mobile Testing.
 * The colour still comes from the backend catalogue, so a type looks the same
 * wherever it appears; only the glyph is chosen here.
 */
const TYPE_ICONS = {
  functional: Settings2,
  smoke: FlaskConical,
  sanity: BadgeCheck,
  regression: RefreshCcw,
  system: Database,
  e2e: Route,
  uat: Users,
  integration: Puzzle,
};

export function testTypeIcon(id) {
  return TYPE_ICONS[id] || Tag;
}
