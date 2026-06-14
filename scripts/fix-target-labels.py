import re
from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'src/app/[locale]/games/petit-buveur/components/game.tsx'
text = p.read_text(encoding='utf-8')

text = text.replace(
    "Joueur ciblé : ${formatPlayerNameHtml",
    "${t('game.targetLabel', { player: formatPlayerNameHtml",
)
text = text.replace(
    "Joueur épargné : ${formatPlayerNameHtml",
    "${t('game.sparedLabel', { player: formatPlayerNameHtml",
)
text = text.replace(
    'A ÉTÉ PROTÉGÉ !',
    "${t('game.effects.protected')}",
)

# Close t() calls: ...formatPlayerNameHtml(X)} -> ...formatPlayerNameHtml(X) })}
text = re.sub(
    r"(t\('game\.(?:target|spared)Label', \{ player: formatPlayerNameHtml\([^)]*(?:\{[^}]*\}[^)]*)?\))\}(?!\))",
    r"\1})}",
    text,
)

p.write_text(text, encoding='utf-8')
print('ok')
