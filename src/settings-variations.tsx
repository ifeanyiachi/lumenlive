import { useState, type ComponentType, type ReactNode } from "react"
import {
  Archive,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Image,
  Languages,
  ListOrdered,
  Mic2,
  Music2,
  Save,
  Search,
  Settings2,
  Tv,
  X,
} from "lucide-react"

import "./settings-variations.css"

type Icon = ComponentType<{ size?: number; strokeWidth?: number }>

const navItems: Array<{ label: string; icon: Icon }> = [
  { label: "Audio", icon: Mic2 },
  { label: "Bible", icon: BookOpen },
  { label: "Display", icon: Tv },
  { label: "Schedule", icon: ListOrdered },
  { label: "Media", icon: Image },
  { label: "Songs", icon: Music2 },
  { label: "Backup", icon: Archive },
]

function Toggle({ tone = "amber", checked = true }: { tone?: "amber" | "teal" | "coral"; checked?: boolean }) {
  const [on, setOn] = useState(checked)
  return (
    <button type="button" className={`sm-toggle sm-toggle-${tone} ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => setOn(!on)}>
      <span />
    </button>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="sm-field">
      <div><strong>{label}</strong>{hint && <small>{hint}</small>}</div>
      {children}
    </div>
  )
}

function Select({ children, tone = "amber" }: { children: ReactNode; tone?: string }) {
  return <button type="button" className={`sm-select sm-select-${tone}`}>{children}<ChevronDown size={13} /></button>
}

function DesktopShell({ children, active = "Dashboard" }: { children: ReactNode; active?: string }) {
  return (
    <div className="sm-desktop-shell">
      <div className="sm-app-bar"><span className="sm-app-logo">L</span><span>LumenLive</span><span className="sm-app-service">Sunday service <i /> live</span><Settings2 size={14} className="sm-app-gear" /></div>
      <div className="sm-app-body">
        <aside className="sm-app-sidebar"><span className="sm-app-caption">WORKSPACE</span>{["Dashboard", "Schedule", "Library", "Broadcast"].map((item) => <span key={item} className={item === active ? "is-active" : ""}>{item}</span>)}<div className="sm-sidebar-spacer" /><span className="sm-app-caption">OUTPUTS</span><span>Program <i className="sm-green-dot" /></span><span>Stage <i className="sm-green-dot" /></span></aside>
        <div className="sm-app-content"><div className="sm-app-content-top"><span>Good morning, Alex</span><span>09:42 AM</span></div><div className="sm-ghost-cards"><div /><div /><div /></div>{children}</div>
      </div>
    </div>
  )
}

function ModalFrame({ children, title, eyebrow, variant, onClose }: { children: ReactNode; title: string; eyebrow: string; variant: string; onClose?: () => void }) {
  return (
    <div className={`sm-modal sm-modal-${variant}`}>
      <header className="sm-modal-header"><div><span className="sm-eyebrow">{eyebrow}</span><h3>{title}</h3></div><button type="button" aria-label="Close settings" onClick={onClose}><X size={15} /></button></header>
      {children}
    </div>
  )
}

function RailModal() {
  const [active, setActive] = useState("Display")
  return (
    <ModalFrame title="Settings" eyebrow="LUMENLIVE" variant="rail">
      <div className="sm-rail-layout">
        <nav className="sm-modal-nav">{navItems.map(({ label, icon: Icon }) => <button type="button" key={label} className={label === active ? "is-active" : ""} onClick={() => setActive(label)}><Icon size={14} strokeWidth={1.8} /><span>{label}</span></button>)}<button type="button" className="sm-nav-help"><CircleHelp size={14} /> Help</button></nav>
        <main className="sm-modal-content"><div className="sm-content-title"><div><span className="sm-eyebrow">DISPLAY</span><h4>{active} behavior</h4></div><Search size={15} /></div><div className="sm-section-label">DETECTION</div><Field label="Send detected verses to" hint="Choose where a match appears first."><Select>Preview queue</Select></Field><Field label="Voice navigation goes live" hint="Next and previous commands control Program."><Toggle checked={false} /></Field><Field label="Confidence threshold" hint="Minimum score for an automatic match."><span className="sm-value">82%</span></Field><div className="sm-range"><span style={{ width: "82%" }} /></div><div className="sm-modal-footer"><span><Check size={12} /> Saved locally</span><button type="button" className="sm-save"><Save size={12} /> Done</button></div></main>
      </div>
    </ModalFrame>
  )
}

function TabsModal() {
  const [active, setActive] = useState("Display")
  return (
    <ModalFrame title="Settings" eyebrow="WORKSPACE PREFERENCES" variant="tabs">
      <div className="sm-tab-strip">{["General", "Audio", "Display", "Language"].map((item) => <button type="button" key={item} className={active === item ? "is-active" : ""} onClick={() => setActive(item)}>{item}</button>)}</div>
      <main className="sm-tabs-content"><div className="sm-content-title"><div><span className="sm-eyebrow">{active.toUpperCase()}</span><h4>Display defaults</h4><p>Set the choices LumenLive uses when a service is moving quickly.</p></div></div><div className="sm-preference-list"><Field label="Detected verse destination"><Select tone="coral">Preview first</Select></Field><Field label="Automatically show confident matches" hint="Only results above your confidence floor."><Toggle tone="coral" /></Field><Field label="Show confirmation before Program" hint="Recommended for a new operator."><Toggle tone="coral" checked={false} /></Field></div><div className="sm-tabs-footer"><button type="button" className="sm-text-button">Reset section</button><button type="button" className="sm-save sm-save-coral">Save changes <Check size={12} /></button></div></main>
    </ModalFrame>
  )
}

function SheetModal() {
  return (
    <ModalFrame title="Settings" eyebrow="QUICK CONFIG" variant="sheet">
      <div className="sm-sheet-top"><div className="sm-sheet-icon"><Settings2 size={18} /></div><div><h4>Make the room feel right</h4><p>Small defaults that keep your service steady.</p></div></div>
      <main className="sm-sheet-content"><div className="sm-sheet-group"><span className="sm-section-label">SERVICE</span><Field label="Default Bible translation"><Select tone="teal">KJV</Select></Field><Field label="Interface language"><Select tone="teal"><Languages size={13} /> English</Select></Field></div><div className="sm-sheet-group"><span className="sm-section-label">AUTOMATION</span><Field label="Voice detection"><Toggle tone="teal" /></Field><Field label="Auto-display to Program"><Toggle tone="teal" checked={false} /></Field></div></main><footer className="sm-sheet-footer"><span>Changes save automatically</span><button type="button" className="sm-save sm-save-teal">Done <Check size={12} /></button></footer>
    </ModalFrame>
  )
}

function Variation({ number, name, description, selected, onSelect, children }: { number: string; name: string; description: string; selected: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <article className={`sm-variation ${selected ? "is-selected" : ""}`}>
      <div className="sm-variation-heading"><div><span className="sm-number">{number}</span><div><span className="sm-eyebrow">{name}</span><h2>{description}</h2></div></div><button type="button" className={`sm-pick ${selected ? "is-selected" : ""}`} onClick={onSelect}>{selected ? <><Check size={12} /> preferred</> : "choose"}</button></div>
      <DesktopShell>{children}</DesktopShell>
    </article>
  )
}

export default function SettingsVariations() {
  const [selected, setSelected] = useState("02")
  return (
    <div className="sm-page">
      <header className="sm-site-header"><div className="sm-site-brand"><span className="sm-app-logo">L</span><span>LumenLive <b>/</b> settings modal</span></div><span className="sm-site-meta">3 simple directions</span></header>
      <main className="sm-page-content"><section className="sm-intro"><div><span className="sm-eyebrow">DESKTOP APP / GEAR BUTTON</span><h1>One small modal.<br /><em>Three good shapes.</em></h1></div><p>The settings experience should feel like a quick pause in the service, not a second product. These directions keep the modal compact, scannable, and easy to dismiss.</p></section><div className="sm-legend"><span>MODAL OPTIONS</span><span>click the controls to explore</span><b>preferred: {selected}</b></div><div className="sm-variations"><Variation number="01" name="Sidebar modal" description="Familiar, clear, and closest to the current app." selected={selected === "01"} onSelect={() => setSelected("01")}><div className="sm-modal-backdrop"><RailModal /></div></Variation><Variation number="02" name="Tabbed modal" description="A single surface with a lighter navigation footprint." selected={selected === "02"} onSelect={() => setSelected("02")}><div className="sm-modal-backdrop"><TabsModal /></div></Variation><Variation number="03" name="Quick sheet" description="The smallest footprint for fast, everyday defaults." selected={selected === "03"} onSelect={() => setSelected("03")}><div className="sm-modal-backdrop"><SheetModal /></div></Variation></div><footer className="sm-footer"><span>interactive prototype</span><span>Settings opens from the gear in the bottom toolbar</span><span>lumenlive.xyz</span></footer></main>
    </div>
  )
}
