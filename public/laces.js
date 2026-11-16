/* Step-by-step "bunny ears" lace guide. Drawn as inline SVG: blue lace and orange lace so each is easy to follow. */
(() => {
  const BLUE = '#3f8cff', ORANGE = '#ff9f1c', INK = '#2b2140', ARROW = '#ff4d6d';

  const lace = (d, colour, end) => `
    <path d="${d}" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="${colour}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    ${end ? `<circle cx="${end[0]}" cy="${end[1]}" r="7" fill="${INK}"/>` : ''}`;
  const thin = (d, colour) => `
    <path d="${d}" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="${colour}" stroke-width="6" stroke-linecap="round"/>`;
  const arrow = (d) => `<path d="${d}" fill="none" stroke="${ARROW}" stroke-width="5" stroke-dasharray="10 8" stroke-linecap="round" marker-end="url(#ah)"/>`;
  const label = (x, y, text, size = 34) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" dominant-baseline="middle">${text}</text>`;

  const shoe = `
    <defs><marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="${ARROW}"/></marker></defs>
    <path d="M58 300 C50 215 92 150 200 142 C308 150 350 215 342 300 Z" fill="#ffffff" stroke="${INK}" stroke-width="5"/>
    <path d="M78 300 C74 232 110 178 200 172 C290 178 326 232 322 300" fill="none" stroke="#e3d8f3" stroke-width="4"/>
    <path d="M166 128 C166 104 234 104 234 128 L238 262 L162 262 Z" fill="#efe7fb" stroke="${INK}" stroke-width="4"/>
    ${thin('M172 232 L228 232', '#c9b8e6')}
    ${thin('M172 232 L228 200', BLUE)}
    ${thin('M228 232 L172 200', ORANGE)}
    ${thin('M228 200 L172 168', BLUE)}
    ${thin('M172 200 L228 168', ORANGE)}
    ${[168, 200, 232].map((y) => `<circle cx="172" cy="${y}" r="7" fill="${INK}"/><circle cx="228" cy="${y}" r="7" fill="${INK}"/>`).join('')}`;

  const svg = (inner) => `<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" role="img">${shoe}${inner}</svg>`;

  // Knot in the middle after the first tie
  const knot = `<ellipse cx="200" cy="150" rx="17" ry="11" fill="${ORANGE}" stroke="${INK}" stroke-width="4"/>
    <path d="M186 146 C196 160 206 140 214 154" fill="none" stroke="${BLUE}" stroke-width="6" stroke-linecap="round"/>`;

  window.LACE_STEPS = [
    {
      title: 'Hold one lace in each hand',
      tip: 'Blue lace in one hand, orange lace in the other.',
      svg: svg(`
        ${lace('M172 168 C150 150 112 132 62 116', BLUE, [62, 116])}
        ${lace('M228 168 C250 150 288 132 338 116', ORANGE, [338, 116])}
        ${label(46, 82, '✋')}${label(354, 82, '🤚')}`),
    },
    {
      title: 'Cross them to make an X',
      tip: 'Lift both laces up and cross them over in the middle.',
      svg: svg(`
        ${lace('M172 168 C186 132 228 96 282 58', BLUE, [282, 58])}
        ${lace('M228 168 C214 132 172 96 118 58', ORANGE, [118, 58])}
        ${label(200, 32, '❌', 28)}`),
    },
    {
      title: 'Tuck the blue one under',
      tip: 'Push the blue end under the orange lace and through the hole at the bottom of the X.',
      svg: svg(`
        ${lace('M172 168 C186 132 214 112 236 106 C262 100 262 132 236 140 C214 146 196 136 186 118', BLUE, [186, 118])}
        ${lace('M228 168 C214 132 172 96 118 58', ORANGE, [118, 58])}
        ${arrow('M248 92 C290 100 280 160 220 160 C186 160 172 138 168 116')}`),
    },
    {
      title: 'Pull both ends tight',
      tip: 'Pull one lace out to each side until it is snug. That is the first knot!',
      svg: svg(`
        ${lace('M200 150 C170 146 120 136 64 118', BLUE, [64, 118])}
        ${lace('M200 150 C230 146 280 136 336 118', ORANGE, [336, 118])}
        ${knot}
        ${arrow('M120 100 L70 84')}${arrow('M280 100 L330 84')}`),
    },
    {
      title: 'Make a bunny ear with blue',
      tip: 'Fold the blue lace into a loop. Pinch it at the bottom so it stays.',
      svg: svg(`
        ${lace('M200 150 C238 146 290 132 340 116', ORANGE, [340, 116])}
        ${lace('M196 150 C168 152 128 140 112 112 C98 88 128 70 150 88 C166 102 172 130 190 146 C170 172 150 200 128 236', BLUE, [128, 236])}
        ${knot}
        ${label(128, 60, '🐰', 30)}`),
    },
    {
      title: 'Make a bunny ear with orange',
      tip: 'Now fold the orange lace into a loop too. Two bunny ears!',
      svg: svg(`
        ${lace('M196 150 C168 152 128 140 112 112 C98 88 128 70 150 88 C166 102 172 130 190 146 C170 172 150 200 128 236', BLUE, [128, 236])}
        ${lace('M204 150 C232 152 272 140 288 112 C302 88 272 70 250 88 C234 102 228 130 210 146 C230 172 250 200 272 236', ORANGE, [272, 236])}
        ${knot}
        ${label(128, 60, '🐰', 30)}${label(272, 60, '🐰', 30)}`),
    },
    {
      title: 'Cross the bunny ears',
      tip: 'Cross the blue ear over the orange ear to make an X.',
      svg: svg(`
        ${lace('M204 148 C186 112 152 64 124 68 C100 74 126 114 196 146 C228 174 252 204 272 236', ORANGE, [272, 236])}
        ${lace('M196 148 C214 112 248 64 276 68 C300 74 274 114 204 146 C172 174 148 204 128 236', BLUE, [128, 236])}
        ${knot}`),
    },
    {
      title: 'Tuck one ear through the hole',
      tip: 'Push the blue ear down under the orange one and through the hole at the bottom.',
      svg: svg(`
        ${lace('M204 148 C186 112 152 64 124 68 C100 74 126 114 196 146 C228 174 252 204 272 236', ORANGE, [272, 236])}
        ${lace('M196 148 C214 112 248 64 276 68 C300 74 274 114 204 146 C172 174 148 204 128 236', BLUE, [128, 236])}
        ${knot}
        ${arrow('M292 62 C340 90 320 168 252 172 C222 174 204 166 196 158')}`),
    },
    {
      title: 'Pull both ears tight. Bow done!',
      tip: 'Hold an ear in each hand and pull out to the sides. You did it! 🎉',
      svg: svg(`
        ${lace('M198 146 C190 176 172 206 150 240', BLUE, [150, 240])}
        ${lace('M202 146 C210 176 228 206 250 240', ORANGE, [250, 240])}
        ${lace('M196 142 C168 108 112 96 100 124 C90 152 150 158 194 146', BLUE)}
        ${lace('M204 142 C232 108 288 96 300 124 C310 152 250 158 206 146', ORANGE)}
        <rect x="186" y="132" width="28" height="22" rx="9" fill="${ORANGE}" stroke="${INK}" stroke-width="4"/>
        ${label(70, 70, '✨', 30)}${label(330, 70, '✨', 30)}${label(200, 40, '🎀', 34)}`),
    },
  ];
})();
