<script>
  import { onMount } from 'svelte';
  import { fly, fade, scale } from 'svelte/transition';
  import { compareChannels, hexToRgb } from '../utils/gameLogic';

  export let targetColor = 'FFFFFF'; // Recebida como prop do Astro

  // Estado do Jogo
  let guesses = []; // Array de { hex, comparison, contrastColor }
  let currentGuess = ''; // Palpite sendo digitado
  let gameStatus = 'playing'; // 'playing' | 'won' | 'lost'
  
  // Modais e Dicas
  let showInstructions = true;
  
  // Feedback
  let toastMessage = '';
  let showToast = false;
  let toastTimeout;

  // Contador para o próximo dia
  let timeRemaining = '00:00:00';

  /**
   * Obtém a data local atual formatada como YYYY-MM-DD
   */
  function getTodayStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Determina o contraste adequado para texto sobre o fundo colorido
   */
  function getContrastColor(hex) {
    if (!hex || hex.length !== 6) return '#ffffff';
    try {
      const { r, g, b } = hexToRgb(hex);
      const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
      return (yiq >= 128) ? '#0c0d12' : '#ffffff';
    } catch (e) {
      return '#ffffff';
    }
  }

  /**
   * Retorna a cor de proximidade (estilo Contexto) para indicar o quão próximo o canal está
   */
  function getClosenessColor(guessHex, targetHex, channel) {
    const guess = hexToRgb(guessHex);
    const target = hexToRgb(targetHex);
    
    let diff = 0;
    if (channel === 'R') diff = Math.abs(guess.r - target.r);
    if (channel === 'G') diff = Math.abs(guess.g - target.g);
    if (channel === 'B') diff = Math.abs(guess.b - target.b);
    
    if (diff === 0) return '#22c55e'; // Exato (Verde)
    if (diff <= 15) return '#eab308'; // Muito Perto (Amarelo)
    if (diff <= 45) return '#f97316'; // Perto (Laranja)
    return '#ef4444'; // Longe (Vermelho)
  }

  /**
   * Salva o estado atual no localStorage com base na data local de hoje
   */
  function saveState() {
    if (typeof window === 'undefined') return;
    const todayStr = getTodayStr();
    const state = {
      targetColor,
      guesses,
      gameStatus
    };
    localStorage.setItem(`hexcode_game_${todayStr}`, JSON.stringify(state));
  }

  /**
   * Carrega o estado salvo do localStorage
   */
  function loadState() {
    const todayStr = getTodayStr();
    const saved = localStorage.getItem(`hexcode_game_${todayStr}`);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.targetColor === targetColor) {
          guesses = state.guesses || [];
          gameStatus = state.gameStatus || 'playing';
          if (guesses.length > 0) {
            showInstructions = false; // Fecha instruções se já começou a jogar
          }
        }
      } catch (e) {
        console.error('Erro ao carregar o estado:', e);
      }
    }
  }

  /**
   * Processa a entrada de caracteres
   */
  function handleKeyInput(key) {
    if (gameStatus !== 'playing') return;

    if (key === 'BACKSPACE') {
      currentGuess = currentGuess.slice(0, -1);
    } else if (key === 'ENTER') {
      if (currentGuess.length === 6) {
        submitGuess();
      } else {
        triggerToast('Digite 6 caracteres hexadecimais.');
      }
    } else {
      if (currentGuess.length < 6) {
        currentGuess += key.toUpperCase();
      }
    }
  }

  /**
   * Envia o palpite atual e avalia os canais
   */
  function submitGuess() {
    if (currentGuess.length !== 6) return;
    if (gameStatus !== 'playing') return;

    const cleanGuess = currentGuess.toUpperCase();
    const comparison = compareChannels(cleanGuess, targetColor);
    const contrastColor = getContrastColor(cleanGuess);

    const newGuess = {
      hex: cleanGuess,
      comparison,
      contrastColor
    };

    guesses = [...guesses, newGuess];
    showInstructions = false;

    // Verifica se ganhou
    if (comparison.every(status => status === '✅')) {
      gameStatus = 'won';
      triggerToast('Sensacional! Código decifrado! 🏆');
    } else if (guesses.length >= 6) {
      gameStatus = 'lost';
      triggerToast('Tentativas esgotadas!');
    }

    currentGuess = '';
    saveState();
  }

  /**
   * Dispara um toast temporário
   */
  function triggerToast(message) {
    toastMessage = message;
    showToast = true;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      showToast = false;
    }, 3000);
  }

  /**
   * Compartilha os resultados no formato padrão
   */
  function shareResults() {
    const attemptsStr = gameStatus === 'won' ? guesses.length : 'X';
    const emojiGrid = guesses.map(g => g.comparison.join(' ')).join('\n');
    const todayStr = getTodayStr();
    const shareText = `HexCode (${todayStr}) - ${attemptsStr}/6\n\n${emojiGrid}\n\nJogue em: ${window.location.origin}`;

    navigator.clipboard.writeText(shareText).then(() => {
      triggerToast('Resultado copiado! Compartilhe com os amigos 🎨');
    }).catch(() => {
      triggerToast('Erro ao copiar os resultados.');
    });
  }

  /**
   * Atualiza o relógio regressivo até a meia-noite
   */
  function updateCountdown() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const diff = tomorrow - now;

    const hours = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, '0');
    const minutes = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
    const seconds = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, '0');

    timeRemaining = `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Escuta eventos do teclado físico
   */
  function handleKeyDown(event) {
    if (gameStatus !== 'playing') return;
    
    // Ignora atalhos com ctrl, cmd, etc.
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toUpperCase();
    if (key === 'BACKSPACE') {
      event.preventDefault();
      handleKeyInput('BACKSPACE');
    } else if (key === 'ENTER') {
      event.preventDefault();
      handleKeyInput('ENTER');
    } else if (/^[0-9A-F]$/.test(key)) {
      event.preventDefault();
      handleKeyInput(key);
    }
  }

  onMount(() => {
    loadState();
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div class="game-board-wrapper">

  <!-- Modal de Instruções (Dismissível) -->
  {#if showInstructions}
    <div class="instructions-card" in:fly={{ y: -15, duration: 300 }} out:fade={{ duration: 150 }}>
      <button class="close-btn" on:click={() => showInstructions = false} aria-label="Fechar instruções">×</button>
      <h3>Como jogar?</h3>
      <p>Adivinhe a cor misteriosa do cabeçalho em 6 tentativas.</p>
      <ul>
        <li>Cada palpite é um código hexadecimal de 6 caracteres (ex: <code>800080</code>).</li>
        <li>O palpite é dividido nos canais <strong>R</strong>ed, <strong>G</strong>reen e <strong>B</strong>lue.</li>
        <li>O feedback matemático indica se o canal secreto é maior (⬆️) ou menor (⬇️) do que o seu chute.</li>
        <li>A barra inferior mostra a proximidade: <span class="dot g"></span> exato, <span class="dot y"></span> muito perto, <span class="dot o"></span> perto, <span class="dot r"></span> longe.</li>
      </ul>
    </div>
  {/if}

  <!-- Painel de Fim de Jogo -->
  {#if gameStatus !== 'playing'}
    <div class="status-card {gameStatus}" in:scale={{ duration: 350, start: 0.9 }}>
      <h2 class="status-title">
        {gameStatus === 'won' ? 'Sensacional!' : 'Fim de Jogo'}
      </h2>
      <p class="status-subtitle">
        {gameStatus === 'won' 
          ? `Você encontrou a cor em ${guesses.length}/6 tentativas.` 
          : 'Suas tentativas acabaram por hoje.'}
      </p>

      <div class="color-reveal">
        <span>Cor do dia:</span>
        <div class="color-reveal-swatch" style="--target-color: #{targetColor};"></div>
        <span class="color-reveal-text">#{targetColor}</span>
      </div>

      <button class="btn-share" on:click={shareResults} id="btn-share-results">
        Compartilhar Resultado 📊
      </button>

      <div class="countdown-section">
        <span>Próxima cor secreta em</span>
        <span class="countdown-time" id="countdown-timer">{timeRemaining}</span>
      </div>
    </div>
  {/if}

  <!-- Grid de Linhas (Sempre 6 tentativas) -->
  <div class="grid-container" role="grid" aria-label="Histórico de palpites">
    {#each Array(6) as _, i}
      {#if i < guesses.length}
        <!-- Linha enviada -->
        <div 
          class="grid-row submitted" 
          style="background-color: #{guesses[i].hex}; color: {guesses[i].contrastColor};"
          in:fly={{ y: 15, duration: 300, delay: i * 50 }}
          role="row"
        >
          <!-- Canal R -->
          <div class="block" role="gridcell">
            <span class="label">R</span>
            <span class="value">{guesses[i].hex.substring(0, 2)}</span>
            <span class="status">{guesses[i].comparison[0]}</span>
            <div class="closeness-bar" style="background-color: {getClosenessColor(guesses[i].hex, targetColor, 'R')};"></div>
          </div>
          <!-- Canal G -->
          <div class="block" role="gridcell">
            <span class="label">G</span>
            <span class="value">{guesses[i].hex.substring(2, 4)}</span>
            <span class="status">{guesses[i].comparison[1]}</span>
            <div class="closeness-bar" style="background-color: {getClosenessColor(guesses[i].hex, targetColor, 'G')};"></div>
          </div>
          <!-- Canal B -->
          <div class="block" role="gridcell">
            <span class="label">B</span>
            <span class="value">{guesses[i].hex.substring(4, 6)}</span>
            <span class="status">{guesses[i].comparison[2]}</span>
            <div class="closeness-bar" style="background-color: {getClosenessColor(guesses[i].hex, targetColor, 'B')};"></div>
          </div>
        </div>
      {:else if i === guesses.length && gameStatus === 'playing'}
        <!-- Linha ativa (digitando) -->
        <div 
          class="grid-row active"
          style={currentGuess.length === 6 ? `background-color: #${currentGuess}; color: ${getContrastColor(currentGuess)}; border-color: rgba(255,255,255,0.15);` : ''}
          role="row"
        >
          <!-- Canal R -->
          <div class="block" role="gridcell">
            <span class="label">R</span>
            <span class="value">{currentGuess.substring(0, 2).padEnd(2, '•')}</span>
            <span class="status">-</span>
          </div>
          <!-- Canal G -->
          <div class="block" role="gridcell">
            <span class="label">G</span>
            <span class="value">{currentGuess.substring(2, 4).padEnd(2, '•')}</span>
            <span class="status">-</span>
          </div>
          <!-- Canal B -->
          <div class="block" role="gridcell">
            <span class="label">B</span>
            <span class="value">{currentGuess.substring(4, 6).padEnd(2, '•')}</span>
            <span class="status">-</span>
          </div>
        </div>
      {:else}
        <!-- Linha vazia -->
        <div class="grid-row empty" role="row">
          <div class="block" role="gridcell">
            <span class="label">R</span>
            <span class="placeholder-dot">• •</span>
          </div>
          <div class="block" role="gridcell">
            <span class="label">G</span>
            <span class="placeholder-dot">• •</span>
          </div>
          <div class="block" role="gridcell">
            <span class="label">B</span>
            <span class="placeholder-dot">• •</span>
          </div>
        </div>
      {/if}
    {/each}
  </div>

  <!-- Teclado Virtual Hexadecimal (Apenas se jogando) -->
  {#if gameStatus === 'playing'}
    <div class="keyboard" in:fly={{ y: 20, duration: 400 }}>
      <div class="keyboard-row">
        {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as char}
          <button type="button" class="key" on:click={() => handleKeyInput(char)}>
            {char}
          </button>
        {/each}
      </div>
      <div class="keyboard-row">
        {#each ['A', 'B', 'C', 'D', 'E', 'F'] as char}
          <button type="button" class="key" on:click={() => handleKeyInput(char)}>
            {char}
          </button>
        {/each}
        <button type="button" class="key key-wide backspace-key" on:click={() => handleKeyInput('BACKSPACE')} aria-label="Apagar">
          ⌫
        </button>
        <button 
          type="button" 
          class="key key-wide enter-key" 
          on:click={() => handleKeyInput('ENTER')} 
          disabled={currentGuess.length !== 6}
        >
          Enviar
        </button>
      </div>
    </div>
  {/if}

  <!-- Toast Toast Notification -->
  {#if showToast}
    <div class="toast" transition:fade={{ duration: 150 }} role="alert">
      {toastMessage}
    </div>
  {/if}
</div>

<style>
  .game-board-wrapper {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    max-width: 440px;
  }

  /* Modal de Instruções */
  .instructions-card {
    position: relative;
    width: 100%;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 1.25rem;
    font-size: 0.85rem;
    color: #cbd5e1;
    backdrop-filter: blur(10px);
  }

  .instructions-card h3 {
    margin-bottom: 0.5rem;
    color: #ffffff;
    font-size: 1rem;
    font-weight: 600;
  }

  .instructions-card ul {
    margin-top: 0.5rem;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .close-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.75rem;
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.4rem;
    cursor: pointer;
    line-height: 1;
  }

  .close-btn:hover {
    color: #ffffff;
  }

  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 0.25rem;
  }
  .dot.g { background: #22c55e; }
  .dot.y { background: #eab308; }
  .dot.o { background: #f97316; }
  .dot.r { background: #ef4444; }

  /* Status Card */
  .status-card {
    width: 100%;
    background-color: var(--bg-card);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 1.5rem;
    text-align: center;
    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(12px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .status-card.won {
    border-color: rgba(34, 197, 94, 0.25);
  }

  .status-card.lost {
    border-color: rgba(239, 68, 68, 0.25);
  }

  .status-title {
    font-size: 1.5rem;
    font-weight: 800;
    margin: 0;
  }

  .status-card.won .status-title {
    color: #4ade80;
  }

  .status-card.lost .status-title {
    color: #f87171;
  }

  .status-subtitle {
    font-size: 0.9rem;
    color: #94a3b8;
    margin-top: -0.5rem;
  }

  .color-reveal {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: rgba(255, 255, 255, 0.04);
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 0.9rem;
  }

  .color-reveal-swatch {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background-color: var(--target-color);
  }

  .color-reveal-text {
    font-family: 'Fira Code', monospace;
    font-weight: 700;
    font-size: 1.05rem;
  }

  .btn-share {
    width: 100%;
    background: #ffffff;
    color: #0c0d12;
    border: none;
    padding: 0.75rem;
    border-radius: 10px;
    font-family: 'Outfit', sans-serif;
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
    transition: var(--transition-smooth);
    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.05);
  }

  .btn-share:hover {
    background: rgba(255, 255, 255, 0.9);
    transform: translateY(-1px);
  }

  .countdown-section {
    font-size: 0.8rem;
    color: #64748b;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    width: 100%;
    padding-top: 0.75rem;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.25rem;
  }

  .countdown-time {
    font-family: 'Fira Code', monospace;
    font-weight: 600;
    color: #f8fafc;
  }

  /* Grid Layout (Wordle / Termo inspired) */
  .grid-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .grid-row {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    border-radius: 8px;
    border: 1.5px solid transparent;
    transition: var(--transition-smooth);
  }

  .grid-row.empty {
    background: transparent;
  }

  .grid-row.empty .block {
    background: rgba(255, 255, 255, 0.01);
    border: 1.5px dashed rgba(255, 255, 255, 0.06);
  }

  .grid-row.active {
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .grid-row.active .block {
    border: 1.5px solid rgba(255, 255, 255, 0.08);
  }

  .grid-row.submitted {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }

  .block {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 0.25rem;
    min-height: 80px;
    position: relative;
    border-radius: 6px;
    transition: var(--transition-smooth);
  }

  .label {
    font-size: 0.65rem;
    font-weight: 700;
    opacity: 0.5;
    margin-bottom: 0.15rem;
  }

  .value {
    font-family: 'Fira Code', monospace;
    font-size: 1.25rem;
    font-weight: 700;
    margin-bottom: 0.15rem;
    letter-spacing: -0.02em;
  }

  .status {
    font-size: 0.95rem;
  }

  .placeholder-dot {
    font-family: 'Fira Code', monospace;
    font-size: 1.15rem;
    color: rgba(255, 255, 255, 0.1);
  }

  /* Barra de proximidade (estilo Contexto) */
  .closeness-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    border-bottom-left-radius: 6px;
    border-bottom-right-radius: 6px;
  }

  /* Teclado Virtual (Estilo Termo) */
  .keyboard {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.5rem;
    background: rgba(10, 11, 16, 0.4);
    padding: 0.75rem;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(8px);
  }

  .keyboard-row {
    display: flex;
    justify-content: center;
    gap: 0.35rem;
    width: 100%;
  }

  .key {
    flex: 1;
    height: 44px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(255, 255, 255, 0.05);
    color: #e2e8f0;
    font-family: 'Fira Code', monospace;
    font-size: 1.05rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    transition: var(--transition-smooth);
  }

  .key:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.1);
  }

  .key:active {
    transform: scale(0.96);
  }

  .key-wide {
    flex: 1.8;
    font-family: 'Outfit', sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .backspace-key {
    background: rgba(239, 68, 68, 0.1);
    color: #f87171;
    border-color: rgba(239, 68, 68, 0.15);
  }
  .backspace-key:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  .enter-key {
    background: rgba(255, 255, 255, 0.85);
    color: #0c0d12;
    border: none;
  }
  .enter-key:hover:not(:disabled) {
    background: #ffffff;
    color: #0c0d12;
  }
  .enter-key:disabled {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.02);
    cursor: not-allowed;
  }

  /* Toast Notification */
  .toast {
    position: fixed;
    bottom: 2rem;
    background-color: #ffffff;
    color: #090a0f;
    padding: 0.65rem 1.35rem;
    border-radius: 8px;
    font-family: 'Outfit', sans-serif;
    font-weight: 700;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
    z-index: 1000;
    text-align: center;
    font-size: 0.85rem;
  }

  /* Responsividade */
  @media (max-width: 480px) {
    .block {
      min-height: 70px;
      padding: 0.5rem 0.25rem;
    }
    .value {
      font-size: 1.1rem;
    }
    .key {
      height: 38px;
      font-size: 0.95rem;
    }
    .key-wide {
      font-size: 0.75rem;
    }
  }
</style>
