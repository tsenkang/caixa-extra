# Herói Supremo (Three.js + Vite)

## Como rodar
```bash
cd heroi-3d
npm install
npm run dev
```
Abra o endereço que aparecer (normalmente http://localhost:5173) no Chrome ou Edge e clique em **JOGAR**.

## Controles
Mouse olhar · WASD mover/voar · Espaço sobe · Ctrl ou C desce · Shift super velocidade ·
Botão esquerdo laser · Botão direito segurar = pegar / soltar = arremessar · segurando alguém: F bate com ele na parede/chão e voar contra prédios arrasta ele pelas paredes · F combo de socos (avança até o inimigo; o 3º soco arremessa) · Q investida · E soco de impacto · P pausa · Esc solta o mouse

## O que tem no jogo
- Cidade com 12 quarteirões: prédios altos (10 a 25 andares), casas, praça com chafariz, posto (as bombas explodem!).
- Prédios feitos de blocos: laser, soco, carros arremessados e explosões quebram blocos; se a base cair, o prédio desaba.
- Inimigos chegam conforme o alerta (estrelas): soldados de jipe, tanques, helicópteros e os heróis Voltagem (raio azul), Corisco (super rápido) e Colosso (gigante).
- P pausa. As opções do menu (sombras e brilho) ajudam se o FPS ficar baixo.

## Arquivos (src/)
`main.js` loop do jogo · `cidade.js` mapa · `predios.js` prédios em blocos e desabamento · `detritos.js` pedaços com física (cannon-es) ·
`particulas.js`/`efeitos.js` poeira, fogo, raios · `heroi.js` herói · `camera.js` · `controles.js` · `poderes.js` laser, soco, pegar ·
`entidades.js` pessoas e carros · `inimigos.js` inimigos e alerta · `hud.js` · `audio.js` sons sintetizados · `modelos.js` modelos simples
