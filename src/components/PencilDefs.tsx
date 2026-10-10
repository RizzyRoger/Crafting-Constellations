// SVG filters shared by every drawn line: a slight pencil wobble
export const PencilDefs = () => (
  <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
    <filter id="pencil">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" xChannelSelector="R" yChannelSelector="G" />
    </filter>
    <filter id="pencil-soft" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="9" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
)
