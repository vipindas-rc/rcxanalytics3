import type { ReactNode } from 'react'
import { AnalyticsMd, ArrowLeftMd, ArrowRightMd, DialpadMd, PlusMd } from '@ringcentral/spring-icon'
import avatar from '../assets/core-frame/avatar.png'
import presence from '../assets/core-frame/presence.svg'
import engage from '../assets/core-frame/engage.svg'
import search from '../assets/core-frame/search.svg'
import chevronDown from '../assets/core-frame/chevron-down.svg'
import message from '../assets/core-frame/message.svg'
import video from '../assets/core-frame/video.svg'
import phone from '../assets/core-frame/phone.svg'
import agent from '../assets/core-frame/agent.svg'
import contacts from '../assets/core-frame/contacts.svg'
import more from '../assets/core-frame/more.svg'
import apps from '../assets/core-frame/apps.svg'
import settings from '../assets/core-frame/settings.svg'
import help from '../assets/core-frame/help.svg'
import './CoreFrame.css'

type CoreFrameProps = { children: ReactNode }
type NavItem = { label: string; icon?: string; badge?: string; selected?: boolean; analytics?: boolean }

const navigation: NavItem[] = [
  { label: 'Message', icon: message, badge: '6' }, { label: 'Video', icon: video },
  { label: 'Phone', icon: phone }, { label: 'Agent', icon: agent },
  { label: 'Analytics', selected: true, analytics: true }, { label: 'Contacts', icon: contacts }, { label: 'More', icon: more },
]
const utilities: NavItem[] = [{ label: 'Apps', icon: apps }, { label: 'Settings', icon: settings }, { label: 'Help', icon: help }]

function RailItem({ item }: { item: NavItem }) {
  return <div className={`core-frame-rail-item ${item.selected ? 'is-selected' : ''}`} aria-hidden="true">
    <span className="core-frame-rail-icon">{item.analytics ? <AnalyticsMd /> : <img src={item.icon} alt="" />}</span><span>{item.label}</span>
    {item.badge && <span className="core-frame-rail-badge">{item.badge}</span>}
  </div>
}

/** Visual RingCentral application frame from Figma node 5:662. */
export function CoreFrame({ children }: CoreFrameProps) {
  return <div className="core-frame" data-node-id="5:662">
    <header className="core-frame-header" aria-label="RingCentral application frame">
      <div className="core-frame-header-background" aria-hidden="true" />
      <div className="core-frame-avatar" aria-hidden="true"><img src={avatar} alt="" /><img className="core-frame-avatar-presence" src={presence} alt="" /></div>
      <div className="core-frame-company">RingCentral, Inc.</div>
      <div className="core-frame-history" aria-hidden="true"><span><ArrowLeftMd /></span><span className="is-muted"><ArrowRightMd /></span></div>
      <div className="core-frame-search" aria-hidden="true"><img src={search} alt="" /><span>Search</span></div>
      <div className="core-frame-header-actions" aria-hidden="true">
        <div className="core-frame-availability"><img src={presence} alt="" /><img src={engage} alt="" /><span>Available</span><span>21:01</span><img src={chevronDown} alt="" /></div>
        <span className="core-frame-round-action"><DialpadMd /></span><span className="core-frame-round-action core-frame-add"><PlusMd /></span>
      </div>
    </header>
    <div className="core-frame-body"><nav className="core-frame-rail" aria-label="Product navigation"><div>{navigation.map(item => <RailItem key={item.label} item={item} />)}</div><div>{utilities.map(item => <RailItem key={item.label} item={item} />)}</div></nav><div className="core-frame-content">{children}</div></div>
  </div>
}
