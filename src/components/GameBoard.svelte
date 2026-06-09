<script>
  import { onMount } from 'svelte';
  import { fly, fade, scale } from 'svelte/transition';
  import { compareChannels, hexToRgb } from '../utils/gameLogic';

  export let targetColor = 'FFFFFF'; // Recebida como prop do Astro (Cor Diária)

  // Visualização Ativa
  let currentView = 'lp'; // 'lp' | 'daily' | 'solo'
  let gameMode = 'daily'; // 'daily' | 'solo'
  
  // Estados de Jogo (Diário)
  let dailyGuesses = [];
  let dailyStatus = 'playing';

  // Estados de Jogo (Solo)
  let soloTargetColor = '';
  let soloGuesses = [];
  let soloStatus = 'playing';

  // Estados Ativos do Tabuleiro (Alocados dinamicamente)
  let guesses = [];
  let gameStatus = 'playing';
  
  // Modais e Auxiliares
  let showInstructions = true;
  let showStatsModal = false;
  let showSoloGameOverModal = false;
  let currentGuess = ''; // Palpite sendo digitado
  let recentDays = []; // Dias recentes para a barra diária
  
  // Estatísticas Pessoais (Desafio Diário)
  let dailyStats = {
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    lastPlayedDate: '',
    guessesDistribution: [0, 0, 0, 0, 0, 0]
  };
  
  // Feedback
  let toastMessage = '';
  let showToast = false;
  let toastTimeout;

  // Contador Diário
  let timeRemaining = '00:00:00';

  // Textos Dinâmicos de Status para a LP
  let dailySummaryText = 'Não iniciado';
  let soloSummaryText = 'Iniciar nova partida';

  /**
   * Monitora o status diário para a LP
   */
  $: {
    if (dailyStatus === 'won') {
      dailySummaryText = `Resolvido em ${dailyGuesses.length}/6 tent. 🏆`;
    } else if (dailyStatus === 'lost') {
      dailySummaryText = 'Tentativas esgotadas ❌';
    } else if (dailyGuesses.length > 0) {
      dailySummaryText = `Em progresso (${dailyGuesses.length}/6 tent.)`;
    } else {
      dailySummaryText = 'Não iniciado (6 tentativas)';
    }
  }

  /**
   * Monitora o status solo para a LP
   */
  $: {
    if (soloStatus === 'won') {
      soloSummaryText = 'Última partida vencida! 🎉';
    } else if (soloStatus === 'lost') {
      soloSummaryText = 'Última partida perdida 😢';
    } else if (soloGuesses.length > 0) {
      soloSummaryText = `Em progresso (${soloGuesses.length}/6 tent.)`;
    } else {
      soloSummaryText = 'Partida livre de adivinhação';
    }
  }

  /**
   * Determina a cor misteriosa ativa baseado no modo atual
   */
  $: currentTargetColor = gameMode === 'daily' ? targetColor : soloTargetColor;

  /**
   * Sincroniza a cor de brilho do fundo com o body do Astro
   */
  $: if (typeof document !== 'undefined') {
    if (currentView === 'lp') {
      // Brilho sutil de fundo misturado na LP
      document.body.style.setProperty('--target-color', 'rgba(255, 255, 255, 0.05)');
    } else if (currentTargetColor) {
      document.body.style.setProperty('--target-color', `#${currentTargetColor}`);
    }
  }

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
   * Calcula o histórico dos últimos 5 dias locais para a fita de calendário
   */
  function getRecentDays() {
    const days = [];
    const weekdays = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
    const now = new Date();
    
    for (let i = 4; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      
      let status = 'none'; // 'win', 'lose', 'none'
      const saved = localStorage.getItem(`hexcode_game_${dateStr}`);
      if (saved) {
        try {
          const state = JSON.parse(saved);
          status = state.gameStatus === 'won' ? 'win' : (state.gameStatus === 'lost' ? 'lose' : 'none');
        } catch (e) {}
      }
      
      days.push({
        label: weekdays[d.getDay()],
        dayNum: d.getDate(),
        dateStr,
        status,
        isToday: i === 0
      });
    }
    return days;
  }

  /**
   * Determina o contraste de cor adequado para o texto (luminância YIQ)
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
   * Retorna a cor de calor/proximidade (estilo Contexto) para a barra
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
   * Salva os estados locais no localStorage
   */
  function saveState() {
    if (typeof window === 'undefined') return;
    const todayStr = getTodayStr();
    
    // Salva diário
    const dailyState = {
      targetColor,
      guesses: dailyGuesses,
      gameStatus: dailyStatus
    };
    localStorage.setItem(`hexcode_game_${todayStr}`, JSON.stringify(dailyState));
    
    // Salva solo
    const soloState = {
      targetColor: soloTargetColor,
      guesses: soloGuesses,
      gameStatus: soloStatus
    };
    localStorage.setItem(`hexcode_solo`, JSON.stringify(soloState));
    
    // Salva a tela visual atual
    localStorage.setItem(`hexcode_view`, currentView);
  }

  /**
   * Carrega os estados salvos do localStorage
   */
  function loadState() {
    const todayStr = getTodayStr();
    
    // Carrega diário
    const savedDaily = localStorage.getItem(`hexcode_game_${todayStr}`);
    if (savedDaily) {
      try {
        const state = JSON.parse(savedDaily);
        if (state.targetColor === targetColor) {
          dailyGuesses = state.guesses || [];
          dailyStatus = state.gameStatus || 'playing';
        }
      } catch (e) {
        console.error(e);
      }
    }
    
    // Carrega solo
    const savedSolo = localStorage.getItem(`hexcode_solo`);
    if (savedSolo) {
      try {
        const state = JSON.parse(savedSolo);
        soloTargetColor = state.targetColor || '';
        soloGuesses = state.guesses || [];
        soloStatus = state.gameStatus || 'playing';
      } catch (e) {
        console.error(e);
      }
    }

    // Carrega estatísticas diárias
    const savedStats = localStorage.getItem('hexcode_stats');
    if (savedStats) {
      try {
        dailyStats = JSON.parse(savedStats);
      } catch (e) {
        console.error(e);
      }
    }
    
    // Carrega fita diária
    recentDays = getRecentDays();

    // Carrega visualização salva
    const preferredView = localStorage.getItem(`hexcode_view`) || 'lp';
    currentView = preferredView;

    if (currentView === 'daily') {
      gameMode = 'daily';
      guesses = dailyGuesses;
      gameStatus = dailyStatus;
      if (dailyStatus !== 'playing') {
        showStatsModal = true;
      }
    } else if (currentView === 'solo') {
      gameMode = 'solo';
      if (!soloTargetColor) {
        startNewSoloGame();
      } else {
        guesses = soloGuesses;
        gameStatus = soloStatus;
        if (soloStatus !== 'playing') {
          showSoloGameOverModal = true;
        }
      }
    }

    if (guesses.length > 0) {
      showInstructions = false;
    }
  }

  /**
   * Altera a visualização entre a LP e as telas de jogo
   */
  function switchView(newView) {
    if (newView === currentView) return;
    
    // Salva o estado atual antes de trocar
    if (currentView === 'daily') {
      dailyGuesses = guesses;
      dailyStatus = gameStatus;
    } else if (currentView === 'solo') {
      soloGuesses = guesses;
      soloStatus = gameStatus;
    }
    
    currentView = newView;
    
    // Carrega o novo estado correspondente
    if (currentView === 'daily') {
      gameMode = 'daily';
      guesses = dailyGuesses;
      gameStatus = dailyStatus;
      if (dailyStatus !== 'playing') {
        showStatsModal = true;
      }
    } else if (currentView === 'solo') {
      gameMode = 'solo';
      if (!soloTargetColor) {
        startNewSoloGame();
      } else {
        guesses = soloGuesses;
        gameStatus = soloStatus;
        if (soloStatus !== 'playing') {
          showSoloGameOverModal = true;
        }
      }
    } else if (currentView === 'lp') {
      recentDays = getRecentDays();
    }
    
    currentGuess = '';
    saveState();
  }

  /**
   * Inicia uma nova partida no modo Solo com uma cor aleatória
   */
  function startNewSoloGame() {
    const chars = '0123456789ABCDEF';
    let color = '';
    for (let i = 0; i < 6; i++) {
      color += chars[Math.floor(Math.random() * 16)];
    }
    soloTargetColor = color;
    soloGuesses = [];
    soloStatus = 'playing';
    showSoloGameOverModal = false;
    
    if (currentView === 'solo') {
      guesses = [];
      gameStatus = 'playing';
    }
    
    currentGuess = '';
    saveState();
  }

  /**
   * Atualiza as estatísticas acumuladas do jogador no Desafio Diário
   */
  function updateDailyStats(isWin, attemptsCount) {
    if (typeof window === 'undefined') return;
    const todayStr = getTodayStr();

    // Evita duplicar cálculo para a mesma data diária
    const statsAlreadyRegistered = localStorage.getItem(`hexcode_stats_registered_${todayStr}`);
    if (statsAlreadyRegistered) return;

    dailyStats.gamesPlayed += 1;

    if (isWin) {
      dailyStats.gamesWon += 1;
      
      // Cálculo de sequência (streak)
      if (dailyStats.lastPlayedDate) {
        const today = new Date(todayStr);
        const lastDate = new Date(dailyStats.lastPlayedDate);
        const diffTime = Math.abs(today - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          dailyStats.currentStreak += 1;
        } else if (diffDays > 1) {
          dailyStats.currentStreak = 1;
        }
      } else {
        dailyStats.currentStreak = 1;
      }

      dailyStats.maxStreak = Math.max(dailyStats.maxStreak, dailyStats.currentStreak);

      // Distribuição de palpites
      if (attemptsCount >= 1 && attemptsCount <= 6) {
        dailyStats.guessesDistribution[attemptsCount - 1] += 1;
      }
    } else {
      dailyStats.currentStreak = 0; // Perdeu quebra o streak
    }

    dailyStats.lastPlayedDate = todayStr;

    localStorage.setItem('hexcode_stats', JSON.stringify(dailyStats));
    localStorage.setItem(`hexcode_stats_registered_${todayStr}`, 'true');
    
    // Força reatividade
    dailyStats = { ...dailyStats };
  }

  /**
   * Auxiliar para calcular a largura proporcional das barras horizontais do gráfico
   */
  function getBarWidth(count) {
    const maxVal = Math.max(...dailyStats.guessesDistribution);
    if (maxVal === 0) return 8;
    return Math.max(8, (count / maxVal) * 100);
  }

  /**
   * Processa a entrada de caracteres das teclas
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
   * Envia o palpite ativo para o tabuleiro
   */
  function submitGuess() {
    if (currentGuess.length !== 6) return;
    if (gameStatus !== 'playing') return;

    const cleanGuess = currentGuess.toUpperCase();
    const comparison = compareChannels(cleanGuess, currentTargetColor);
    const contrastColor = getContrastColor(cleanGuess);

    const newGuess = {
      hex: cleanGuess,
      comparison,
      contrastColor
    };

    guesses = [...guesses, newGuess];
    showInstructions = false;

    // Avalia o resultado
    if (comparison.every(status => status === '✅')) {
      gameStatus = 'won';
      triggerToast('Código decifrado com sucesso! 🎉');
    } else if (guesses.length >= 6) {
      gameStatus = 'lost';
      triggerToast('Fim de jogo!');
    }

    // Atualiza estados específicos dos modos
    if (gameMode === 'daily') {
      dailyGuesses = guesses;
      dailyStatus = gameStatus;
      if (gameStatus !== 'playing') {
        updateDailyStats(gameStatus === 'won', dailyGuesses.length);
        setTimeout(() => {
          showStatsModal = true;
        }, 1000);
      }
    } else {
      soloGuesses = guesses;
      soloStatus = gameStatus;
      if (gameStatus !== 'playing') {
        setTimeout(() => {
          showSoloGameOverModal = true;
        }, 1000);
      }
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
   * Copia o resultado do desafio diário para a área de transferência
   */
  function shareResults() {
    const attemptsStr = gameStatus === 'won' ? guesses.length : 'X';
    const emojiGrid = guesses.map(g => g.comparison.join(' ')).join('\n');
    const todayStr = getTodayStr();
    const shareText = `HexCode (${todayStr}) - ${attemptsStr}/6\n\n${emojiGrid}\n\nJogue em: ${window.location.origin}`;

    navigator.clipboard.writeText(shareText).then(() => {
      triggerToast('Resultado copiado para compartilhamento! 🎨');
    }).catch(() => {
      triggerToast('Erro ao copiar os resultados.');
    });
  }

  /**
   * Relógio regressivo da cor diária
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
   * Captura inputs físicos de teclado
   */
  function handleKeyDown(event) {
    if (gameStatus !== 'playing') return;
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

    // Mapeia o clique do logotipo principal do Astro para voltar para a LP
    const headerLogo = document.querySelector('#main-header');
    if (headerLogo) {
      headerLogo.addEventListener('click', () => {
        switchView('lp');
      });
      headerLogo.style.cursor = 'pointer';
      headerLogo.title = 'Voltar para a Página Inicial';
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div class="game-board-wrapper">

  <!-- ================= TELA DA LANDING PAGE (LP) ================= -->
  {#if currentView === 'lp'}
    <div class="lp-container" in:fade={{ duration: 200 }} out:fade={{ duration: 150 }}>
      <!-- Ícone Estilizado RGB (Igual ao logo do Contexto, mas RGB) -->
      <div class="logo-stack" aria-hidden="true">
        <div class="logo-bar red"></div>
        <div class="logo-bar green"></div>
        <div class="logo-bar blue"></div>
      </div>

      <h2 class="lp-title">HEXCODE</h2>
      <p class="lp-subtitle">Decifre o código de cores diário</p>

      <!-- Botão de Login (Mera Simulação Visual para bater com a imagem do Contexto) -->
      <button class="lp-login-btn" on:click={() => triggerToast('Acesso de login indisponível offline!')}>
        Login
      </button>

      <!-- Card do Jogo Diário -->
      <div class="lp-card">
        <div class="lp-card-header">
          <div class="lp-card-info">
            <h3>Jogo Diário</h3>
            <span class="lp-card-status">{dailySummaryText}</span>
          </div>
          <button class="lp-play-btn" on:click={() => switchView('daily')}>
            Jogar
          </button>
        </div>

        <!-- Fita de Histórico dos Últimos 5 Dias (Estilo Contexto) -->
        <div class="calendar-strip">
          {#each recentDays as day}
            <div class="calendar-day" class:today={day.isToday} title={day.dateStr}>
              <span class="calendar-day-label">{day.label}</span>
              <div class="calendar-day-circle {day.status}">
                {day.dayNum}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Card do Jogo Ilimitado (Modo Solo) -->
      <div class="lp-card">
        <div class="lp-card-header">
          <div class="lp-card-info">
            <h3>Ilimitado ♾️</h3>
            <p class="lp-card-desc">{soloSummaryText}</p>
          </div>
          <button class="lp-play-btn solo" on:click={() => switchView('solo')}>
            Jogar
          </button>
        </div>
      </div>

      <!-- Links de Menu Inferiores (Estilo Contexto) -->
      <div class="lp-footer-menu">
        <button class="footer-link" on:click={() => showStatsModal = true}>
          📊 Estatísticas
        </button>
        <button class="footer-link" on:click={() => triggerToast('Obrigado! Envie seu feedback para contato@hexcode.com.br 📧')}>
          💬 Feedback
        </button>
        <button class="footer-link" on:click={() => triggerToast('Idioma ativo: Português (Brasil) 🇧🇷')}>
          🌐 Idioma
        </button>
        <button class="footer-link" on:click={() => triggerToast('Tema escuro calibrado por padrão 🌙')}>
          🎨 Tema
        </button>
        <button class="footer-link" on:click={() => switchView('daily') & (showInstructions = true)}>
          ❓ FAQ / Ajuda
        </button>
      </div>
    </div>

  <!-- ================= TELA DOS TABULEIROS DE JOGO ================= -->
  {:else}
    <div class="board-view-container" in:fly={{ y: 15, duration: 300 }} out:fade={{ duration: 150 }}>
      <!-- Barra Superior interna do Tabuleiro -->
      <div class="board-header">
        <button type="button" class="back-home-btn" on:click={() => switchView('lp')}>
          <svg viewBox="0 0 24 24" class="back-icon" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Voltar
        </button>
        <span class="board-mode-title">
          {currentView === 'daily' ? 'Desafio Diário' : 'Modo Ilimitado'}
        </span>
        <div class="header-actions">
          {#if gameMode === 'daily'}
            <button type="button" class="header-action-btn" on:click={() => showStatsModal = true} title="Estatísticas">
              <svg viewBox="0 0 24 24" class="header-icon" aria-hidden="true">
                <path d="M18 20V10M12 20V4M6 20v-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          {:else if gameMode === 'solo' && gameStatus !== 'playing'}
            <button type="button" class="header-action-btn" on:click={startNewSoloGame} title="Jogar Novamente">
              <svg viewBox="0 0 24 24" class="header-icon" aria-hidden="true" style="stroke: currentColor; fill: none;">
                <path d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5-5v5h5M4 13a8.1 8.1 0 0 0 15.5 2m.5 5v-5h-5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          {/if}
        </div>
      </div>

      <!-- Modal de Instruções -->
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



      <!-- Grid de Linhas (Dinâmico, cresce conforme joga) -->
      <div class="grid-container" role="grid" aria-label="Histórico de palpites">
        {#each guesses as guess, i}
          <!-- Linha enviada -->
          <div 
            class="grid-row submitted" 
            style="background-color: #{guess.hex}; color: {guess.contrastColor};"
            in:fly={{ y: 15, duration: 300 }}
            role="row"
          >
            <!-- Canal R -->
            <div class="block" role="gridcell">
              <span class="label">R</span>
              <span class="value">{guess.hex.substring(0, 2)}</span>
              <div class="status-container">
                {#if guess.comparison[0] === '⬆️'}
                  <svg viewBox="0 0 24 24" class="status-icon" aria-hidden="true">
                    <path d="M12 19V5M12 5l-7 7M12 5l7 7" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {:else if guess.comparison[0] === '⬇️'}
                  <svg viewBox="0 0 24 24" class="status-icon" aria-hidden="true">
                    <path d="M12 5v14M12 19l-7-7M12 19l7-7" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {:else}
                  <svg viewBox="0 0 24 24" class="status-icon check" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {/if}
              </div>
              <div class="closeness-bar" style="background-color: {getClosenessColor(guess.hex, currentTargetColor, 'R')};"></div>
            </div>
            <!-- Canal G -->
            <div class="block" role="gridcell">
              <span class="label">G</span>
              <span class="value">{guess.hex.substring(2, 4)}</span>
              <div class="status-container">
                {#if guess.comparison[1] === '⬆️'}
                  <svg viewBox="0 0 24 24" class="status-icon" aria-hidden="true">
                    <path d="M12 19V5M12 5l-7 7M12 5l7 7" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {:else if guess.comparison[1] === '⬇️'}
                  <svg viewBox="0 0 24 24" class="status-icon" aria-hidden="true">
                    <path d="M12 5v14M12 19l-7-7M12 19l7-7" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {:else}
                  <svg viewBox="0 0 24 24" class="status-icon check" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {/if}
              </div>
              <div class="closeness-bar" style="background-color: {getClosenessColor(guess.hex, currentTargetColor, 'G')};"></div>
            </div>
            <!-- Canal B -->
            <div class="block" role="gridcell">
              <span class="label">B</span>
              <span class="value">{guess.hex.substring(4, 6)}</span>
              <div class="status-container">
                {#if guess.comparison[2] === '⬆️'}
                  <svg viewBox="0 0 24 24" class="status-icon" aria-hidden="true">
                    <path d="M12 19V5M12 5l-7 7M12 5l7 7" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {:else if guess.comparison[2] === '⬇️'}
                  <svg viewBox="0 0 24 24" class="status-icon" aria-hidden="true">
                    <path d="M12 5v14M12 19l-7-7M12 19l7-7" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {:else}
                  <svg viewBox="0 0 24 24" class="status-icon check" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {/if}
              </div>
              <div class="closeness-bar" style="background-color: {getClosenessColor(guess.hex, currentTargetColor, 'B')};"></div>
            </div>
          </div>
        {/each}

        {#if gameStatus === 'playing'}
          <!-- Linha ativa (digitando) -->
          <div 
            class="grid-row active"
            style={currentGuess.length === 6 ? `background-color: #${currentGuess}; color: ${getContrastColor(currentGuess)}; border-color: rgba(255,255,255,0.15);` : ''}
            role="row"
            in:fly={{ y: 10, duration: 250 }}
          >
            <!-- Canal R -->
            <div class="block" class:filled={currentGuess.length >= 2} role="gridcell">
              <span class="label">R</span>
              <span class="value">{currentGuess.substring(0, 2).padEnd(2, '•')}</span>
              <div class="status-container">
                <span class="status-placeholder">-</span>
              </div>
            </div>
            <!-- Canal G -->
            <div class="block" class:filled={currentGuess.length >= 4} role="gridcell">
              <span class="label">G</span>
              <span class="value">{currentGuess.substring(2, 4).padEnd(2, '•')}</span>
              <div class="status-container">
                <span class="status-placeholder">-</span>
              </div>
            </div>
            <!-- Canal B -->
            <div class="block" class:filled={currentGuess.length >= 6} role="gridcell">
              <span class="label">B</span>
              <span class="value">{currentGuess.substring(4, 6).padEnd(2, '•')}</span>
              <div class="status-container">
                <span class="status-placeholder">-</span>
              </div>
            </div>
          </div>
        {/if}
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
    </div>
  {/if}

  <!-- Toast Notification -->
  {#if showToast}
    <div class="toast" transition:fade={{ duration: 150 }} role="alert">
      {toastMessage}
    </div>
  {/if}

  <!-- Modal de Estatísticas Pessoais (Wordle-style overlay) -->
  {#if showStatsModal}
    <div class="modal-overlay" transition:fade={{ duration: 150 }} on:click|self={() => showStatsModal = false} role="dialog" aria-modal="true" aria-labelledby="modal-stats-title">
      <div class="modal-content" in:scale={{ duration: 200, start: 0.95 }} out:scale={{ duration: 150, start: 0.95 }}>
        <button class="modal-close-btn" on:click={() => showStatsModal = false} aria-label="Fechar estatísticas">×</button>
        
        <h3 class="modal-title" id="modal-stats-title">Estatísticas</h3>
        
        <div class="stats-grid">
          <div class="stat-box">
            <span class="stat-value">{dailyStats.gamesPlayed}</span>
            <span class="stat-label">Jogados</span>
          </div>
          <div class="stat-box">
            <span class="stat-value">
              {dailyStats.gamesPlayed > 0 
                ? Math.round((dailyStats.gamesWon / dailyStats.gamesPlayed) * 100) 
                : 0}%
            </span>
            <span class="stat-label">Vitórias</span>
          </div>
          <div class="stat-box">
            <span class="stat-value">{dailyStats.currentStreak}</span>
            <span class="stat-label">Seq. Atual</span>
          </div>
          <div class="stat-box">
            <span class="stat-value">{dailyStats.maxStreak}</span>
            <span class="stat-label">Melhor Seq.</span>
          </div>
        </div>

        <div class="stats-distribution">
          <h4>Distribuição de Palpites</h4>
          {#each dailyStats.guessesDistribution as count, idx}
            <div class="distribution-row">
              <span class="attempt-num">{idx + 1}</span>
              <div class="bar-container">
                <div 
                  class="bar" 
                  class:highlight={dailyStatus === 'won' && dailyGuesses.length === idx + 1}
                  style="width: {getBarWidth(count)}%;"
                >
                  <span class="count-value">{count}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>

        {#if dailyStatus !== 'playing' && gameMode === 'daily'}
          <div class="modal-game-over-actions">
            <div class="color-reveal">
              <span>Cor Secreta:</span>
              <div class="color-reveal-swatch" style="--target-color: #{currentTargetColor};"></div>
              <span class="color-reveal-text">#{currentTargetColor}</span>
            </div>
            
            <button class="btn-share" on:click={shareResults}>
              Compartilhar 📊
            </button>
            
            <div class="countdown-section">
              <span>Próxima cor em</span>
              <span class="countdown-time">{timeRemaining}</span>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Modal de Fim de Jogo (Modo Solo) -->
  {#if showSoloGameOverModal}
    <div class="modal-overlay" transition:fade={{ duration: 150 }} on:click|self={() => showSoloGameOverModal = false} role="dialog" aria-modal="true" aria-labelledby="modal-solo-title">
      <div class="modal-content" in:scale={{ duration: 200, start: 0.95 }} out:scale={{ duration: 150, start: 0.95 }}>
        <button class="modal-close-btn" on:click={() => showSoloGameOverModal = false} aria-label="Fechar">×</button>
        
        <h3 class="modal-title" id="modal-solo-title">
          {soloStatus === 'won' ? 'Vitória! 🎉' : 'Fim de Jogo 😢'}
        </h3>
        <p class="status-subtitle" style="text-align: center; margin-bottom: 0.5rem; color: #94a3b8; font-size: 0.9rem;">
          {soloStatus === 'won' 
            ? `Você acertou em ${guesses.length}/6 tentativas.` 
            : 'Suas tentativas acabaram.'}
        </p>

        <div class="color-reveal" style="justify-content: center; margin-bottom: 0.5rem; width: 100%;">
          <span>Cor Secreta:</span>
          <div class="color-reveal-swatch" style="--target-color: #{currentTargetColor};"></div>
          <span class="color-reveal-text">#{currentTargetColor}</span>
        </div>

        <button class="btn-share btn-play-again" on:click={startNewSoloGame} style="width: 100%; margin-top: 0.5rem;">
          Jogar Novamente 🔄
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  .game-board-wrapper {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    max-width: 440px;
  }

  /* ================= ESTILOS DA LANDING PAGE (LP) ================= */
  .lp-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 1.5rem 0.5rem;
  }

  /* Logo Stack RGB em degrade brilhante */
  .logo-stack {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .logo-bar {
    height: 7px;
    border-radius: 9999px;
    box-shadow: 0 0 12px currentColor;
    opacity: 0.95;
  }

  .logo-bar.red {
    width: 52px;
    background-color: #ef4444;
    color: rgba(239, 68, 68, 0.65);
    transform: translateX(-12px);
  }

  .logo-bar.green {
    width: 70px;
    background-color: #10b981;
    color: rgba(16, 185, 129, 0.65);
  }

  .logo-bar.blue {
    width: 45px;
    background-color: #3b82f6;
    color: rgba(59, 130, 246, 0.65);
    transform: translateX(10px);
  }

  .lp-title {
    font-family: 'Fira Code', monospace;
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #ffffff;
    margin-top: -0.5rem;
    text-shadow: 0 0 25px rgba(255, 255, 255, 0.1);
  }

  .lp-subtitle {
    font-size: 0.9rem;
    color: #64748b;
    margin-top: -1.25rem;
    font-weight: 500;
  }

  .lp-login-btn {
    background: #3b82f6;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    padding: 0.5rem 2.25rem;
    font-family: 'Outfit', sans-serif;
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
    transition: var(--transition-smooth);
    margin-bottom: 0.5rem;
  }

  .lp-login-btn:hover {
    background: #2563eb;
    box-shadow: 0 4px 16px rgba(59, 130, 246, 0.35);
  }

  /* Cards da LP */
  .lp-card {
    width: 100%;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    padding: 1.25rem;
    backdrop-filter: blur(10px);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
  }

  .lp-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    gap: 1rem;
  }

  .lp-card-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex: 1;
  }

  .lp-card-info h3 {
    font-size: 1.1rem;
    color: #ffffff;
    font-weight: 700;
  }

  .lp-card-status {
    font-size: 0.8rem;
    color: #94a3b8;
    font-family: 'Outfit', sans-serif;
  }

  .lp-card-desc {
    font-size: 0.8rem;
    color: #64748b;
    line-height: 1.3;
  }

  .lp-play-btn {
    background: #3b82f6;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    padding: 0.55rem 1.4rem;
    font-family: 'Outfit', sans-serif;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    transition: var(--transition-smooth);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
  }

  .lp-play-btn:hover {
    background: #2563eb;
    box-shadow: 0 4px 16px rgba(59, 130, 246, 0.35);
  }

  .lp-play-btn.solo {
    background: #10b981;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
  }

  .lp-play-btn.solo:hover {
    background: #059669;
    box-shadow: 0 4px 16px rgba(16, 185, 129, 0.35);
  }

  /* Fita de Calendário */
  .calendar-strip {
    display: flex;
    justify-content: space-between;
    width: 100%;
    background: rgba(0, 0, 0, 0.25);
    padding: 0.6rem;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.03);
  }

  .calendar-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    flex: 1;
  }

  .calendar-day-label {
    font-size: 0.6rem;
    color: #64748b;
    font-weight: 600;
    text-transform: capitalize;
  }

  .calendar-day-circle {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.04);
    color: #64748b;
  }

  .calendar-day-circle.win {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.5);
    color: #4ade80;
  }

  .calendar-day-circle.lose {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.5);
    color: #f87171;
  }

  .calendar-day.today .calendar-day-circle {
    background: #3b82f6;
    border-color: #3b82f6;
    color: #ffffff;
    box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
  }

  /* Footer da LP */
  .lp-footer-menu {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 1rem;
    width: 100%;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.02);
  }

  .footer-link {
    background: none;
    border: none;
    color: #64748b;
    font-family: 'Outfit', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition-smooth);
    padding: 0.25rem 0.5rem;
  }

  .footer-link:hover {
    color: #94a3b8;
  }

  /* ================= ESTILOS DOS TABULEIROS ================= */
  .board-view-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
  }

  .board-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .back-home-btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
    padding: 0.4rem 0.8rem;
    border-radius: 8px;
    font-family: 'Outfit', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    transition: var(--transition-smooth);
  }

  .back-home-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.15);
  }

  .back-icon {
    width: 14px;
    height: 14px;
    stroke-width: 3.5;
  }

  .board-mode-title {
    font-family: 'Fira Code', monospace;
    font-size: 0.85rem;
    font-weight: 600;
    color: #64748b;
    letter-spacing: 0.02em;
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

  .btn-play-again {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: #ffffff;
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
  }

  .btn-play-again:hover {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    box-shadow: 0 4px 18px rgba(16, 185, 129, 0.4);
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

  /* Painel de Estatísticas */
  .stats-grid {
    display: flex;
    justify-content: space-around;
    width: 100%;
    gap: 0.5rem;
  }

  .stat-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 800;
    color: #ffffff;
  }

  .stat-label {
    font-size: 0.65rem;
    color: #64748b;
    text-align: center;
    margin-top: 0.15rem;
  }

  /* Gráfico de Distribuição de Palpites */
  .stats-distribution {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: 100%;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    padding-top: 0.85rem;
  }

  .stats-distribution h4 {
    font-size: 0.85rem;
    color: #94a3b8;
    margin-bottom: 0.35rem;
    text-align: center;
  }

  .distribution-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
  }

  .attempt-num {
    font-weight: 700;
    width: 12px;
    color: #64748b;
    text-align: right;
  }

  .bar-container {
    flex: 1;
    background: rgba(255, 255, 255, 0.01);
    border-radius: 4px;
    height: 18px;
    display: flex;
    align-items: center;
  }

  .bar {
    background: #475569;
    color: #ffffff;
    font-family: 'Fira Code', monospace;
    font-weight: 700;
    font-size: 0.7rem;
    height: 100%;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 0.4rem;
    min-width: 20px;
    transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .bar.highlight {
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.2);
  }

  .count-value {
    line-height: 1;
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

  .status-container {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 20px;
    margin-top: 0.1rem;
    color: currentColor;
  }

  .status-icon {
    width: 18px;
    height: 18px;
    stroke-width: 3.5;
    opacity: 0.9;
  }

  .status-icon.check {
    filter: drop-shadow(0 0 2px currentColor);
  }

  .status-placeholder {
    font-size: 0.9rem;
    opacity: 0.25;
  }

  .block.filled {
    animation: popIn 0.12s ease-out;
  }

  @keyframes popIn {
    0% {
      transform: scale(0.96);
    }
    100% {
      transform: scale(1);
    }
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
    transition: var(--transition-smooth);
  }
  .enter-key:hover:not(:disabled) {
    background: #ffffff;
    color: #0c0d12;
    transform: translateY(-1px);
  }
  .enter-key:not(:disabled) {
    background: #10b981;
    color: #ffffff;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    animation: pulseButton 1.5s infinite alternate;
  }
  .enter-key:not(:disabled):hover {
    background: #059669;
    color: #ffffff;
    box-shadow: 0 4px 16px rgba(16, 185, 129, 0.5);
  }
  .enter-key:disabled {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.02);
    cursor: not-allowed;
    box-shadow: none;
  }

  @keyframes pulseButton {
    0% {
      box-shadow: 0 4px 10px rgba(16, 185, 129, 0.25);
    }
    100% {
      box-shadow: 0 4px 18px rgba(16, 185, 129, 0.55);
    }
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

  /* Modal Overlay */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(9, 10, 15, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    padding: 1rem;
  }

  .modal-content {
    position: relative;
    width: 100%;
    max-width: 400px;
    background: #0f1016;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 1.5rem;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .modal-content .modal-close-btn {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: var(--transition-smooth);
  }

  .modal-content .modal-close-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
  }

  .modal-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #ffffff;
    text-align: center;
    margin-bottom: 0.25rem;
    letter-spacing: 0.02em;
  }

  .modal-game-over-actions {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    padding-top: 1rem;
    width: 100%;
  }

  /* Header action buttons for stats */
  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .header-action-btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: var(--transition-smooth);
  }

  .header-action-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.15);
  }

  .header-icon {
    width: 16px;
    height: 16px;
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
