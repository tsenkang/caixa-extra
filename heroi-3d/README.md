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
- Animações: o herói respira parado e depois faz a pose heroica (mãos na cintura, olhando em volta); anda e corre com o corpo balançando; voa inclinando nas curvas como um avião; soca puxando o braço e girando o tronco (e fica em guarda); pousa agachado, ou na "pose de super-herói" (joelho e punho no chão, com onda de choque) se vier rápido; se debate quando é arremessado; pisca. A capa ondula e balança nas curvas. O Corisco corre no ar, o Colosso anda pesado balançando, o Viltrumita alterna os braços nos socos, o Godzilla se encolhe com golpes fortes e as pessoas correm inclinadas com medo.
- Personagens com músculos (bíceps, coxas, panturrilhas), boca, brilho nos olhos e luz de contorno nas bordas (como em animação).
- Destruição com material de verdade: blocos inteiros caem com a cara do prédio; batidas soltam pedras de concreto, vergalhões de ferro torcidos, tijolos soltos e cacos de vidro (que brilham, tilintam no chão e somem mais rápido).
- O jogo tem 6 fases: 1) O Exército (derrote 12 inimigos), 2) Voltagem (raio azul), 3) Corisco (super rápido), 4) Colosso (gigante), 5) O Viltrumita (penúltimo chefe: combos, agarrão e "pinball" pelos prédios), 6) GODZILLA (chefe final: sopro atômico, giro de cauda, pisão, mordida e rugido).
- Entre as fases a vida enche. No menu ("Começar na fase") dá para escolher qualquer fase, e ao cair dá para tentar a mesma fase de novo.
- Viltrumita (versão difícil): 3200 de vida, bloqueia socos e revida, escapa do combo no 3º soco seguido (só leva o combo inteiro na brecha logo depois que ataca), desvia do laser e do avanço, e se regenera se ficar 3 s sem apanhar.
- Godzilla (versão difícil): 11000 de vida, couro que resiste ao laser, pulso nuclear se você ficar batendo de perto, bolas atômicas teleguiadas se você ficar longe, e radiação: perto dele (110 m) você não se cura.
- Dica contra o Godzilla: quando as placas das costas acenderem, ele vai soltar o sopro atômico. Atire o laser de volta na boca dele para causar um choque de raios (dano enorme).
- O exército continua chegando conforme o alerta (estrelas).
- P pausa. As opções do menu (sombras e brilho) ajudam se o FPS ficar baixo.

## Arquivos (src/)
`main.js` loop do jogo · `cidade.js` mapa · `predios.js` prédios em blocos e desabamento · `detritos.js` pedaços com física (cannon-es) ·
`particulas.js`/`efeitos.js` poeira, fogo, raios · `heroi.js` herói · `camera.js` · `controles.js` · `poderes.js` laser, soco, pegar ·
`entidades.js` pessoas e carros · `inimigos.js` inimigos e alerta · `hud.js` · `audio.js` sons sintetizados · `modelos.js` modelos simples
