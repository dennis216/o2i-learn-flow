
// Flat mathematical illustration for the editorial green concept.
export default function LearningGraph() {
  return (
    <div className="learning-graph" aria-hidden="true">
      <div className="graph-heading"><span>ONE TO INFINITY</span><span>01 / ∞</span></div>
      <svg viewBox="0 0 500 340" fill="none" className="w-full">
        <path d="M65 65H455M65 125H455M65 185H455M65 245H455M145 35V285M225 35V285M305 35V285M385 35V285" stroke="hsl(var(--studio-white) / .07)" />
        <path d="M65 255C190 255 282 225 340 159S408 59 442 35V285H65Z" fill="hsl(var(--accent-text) / .035)" />
        <path d="M145 281V289M225 281V289M305 281V289M385 281V289M61 65H69M61 125H69M61 185H69" stroke="hsl(var(--accent-text) / .4)" />
        <path d="M40 285H465M65 310V30" stroke="hsl(var(--studio-white) / .35)" strokeWidth="1" />
        <path d="M65 255C190 255 282 225 340 159S408 59 442 35" stroke="hsl(var(--accent-text))" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M65 255C170 254 270 233 360 206S420 185 450 171" stroke="hsl(var(--studio-white) / .2)" strokeWidth="1" strokeDasharray="4 7" />
        <path d="M431 35H442V46" stroke="hsl(var(--accent-text))" strokeWidth="2" />
        <circle cx="65" cy="255" r="5" fill="hsl(var(--accent-text))" />
        <circle cx="340" cy="159" r="13" stroke="hsl(var(--accent-text) / .16)" />
        <circle cx="442" cy="35" r="4" fill="hsl(var(--accent-text))" />
        <circle cx="340" cy="159" r="4" fill="hsl(var(--studio-ink))" stroke="hsl(var(--accent-text))" strokeWidth="1.5" />
        <path d="M340 173V285" stroke="hsl(var(--accent-text) / .25)" strokeDasharray="3 5" />
        <text x="45" y="260" fill="hsl(var(--accent-text))" fontSize="14" fontFamily="Georgia, serif">1</text>
        <text x="430" y="18" fill="hsl(var(--accent-text))" fontSize="26" fontFamily="Georgia, serif">∞</text>
        <text x="360" y="140" fill="hsl(var(--studio-muted))" fontSize="14" fontStyle="italic" fontFamily="Georgia, serif">f(x)</text>
        <text x="460" y="308" fill="hsl(var(--studio-muted))" fontSize="13" fontStyle="italic" fontFamily="Georgia, serif">x</text>
      </svg>
      <div className="graph-subjects"><span>AP CALCULUS</span><span>SAT MATH</span><span>AMC</span></div>
    </div>
  );
}
