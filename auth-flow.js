/* Fluxo de autenticação por link: convite (invite) ou recuperação (recovery). */
(async () => {
  const $ = (selector) => document.querySelector(selector);
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const mode = document.body.dataset.authMode === 'recovery' ? 'recovery' : 'invite';
  const isRecoveryPage = mode === 'recovery';
  const sections = ['loading', 'setup', 'done', 'problem'];
  const show = (id) => sections.forEach((name) => $('#' + name).classList.toggle('hidden', name !== id));
  const say = (message, type = '') => {
    $('#message').textContent = message;
    $('#message').className = 'message ' + type;
  };
  const fail = (message) => {
    show('problem');
    $('#problemTitle').textContent = isRecoveryPage ? 'Não foi possível validar a redefinição' : 'Não foi possível validar o convite';
    $('#problemText').textContent = message;
    say(message, 'error');
  };

  try {
    // O Supabase devolve erros de OTP diretamente na query string quando o link
    // expirou ou já foi utilizado. Mostra uma orientação clara em vez de tentar
    // interpretar a URL como uma sessão válida.
    const authErrorCode = params.get('error_code');
    const authError = params.get('error');
    if (authError || authErrorCode) {
      const expired = authErrorCode === 'otp_expired';
      const message = expired
        ? (isRecoveryPage
            ? 'Este link de redefinição expirou ou já foi utilizado. Volte ao portal e solicite um novo link em “Esqueci minha senha”.'
            : 'Este convite expirou ou já foi utilizado. Peça ao administrador que envie um novo convite.')
        : (params.get('error_description') || 'Não foi possível validar o link. Solicite um novo e-mail.').replace(/\+/g, ' ');
      fail(message);
      return;
    }

    if (!window.DOPAMINA_SUPABASE_URL || !window.DOPAMINA_SUPABASE_ANON_KEY ||
        window.DOPAMINA_SUPABASE_URL.includes('SEU-PROJETO') ||
        window.DOPAMINA_SUPABASE_ANON_KEY.includes('SUA_CHAVE')) {
      throw new Error('A configuração do Supabase não foi encontrada. Preserve o arquivo portal-config.js configurado no site.');
    }

    const sb = window.supabase.createClient(
      window.DOPAMINA_SUPABASE_URL,
      window.DOPAMINA_SUPABASE_ANON_KEY,
      { auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true } }
    );

    // Processa explicitamente os três formatos que o Supabase pode devolver:
    // PKCE (?code=), tokens no fragmento (#access_token=...) ou token_hash.
    const code = params.get('code');
    const tokenHash = params.get('token_hash') || hashParams.get('token_hash');
    const linkType = params.get('type') || hashParams.get('type') || (isRecoveryPage ? 'recovery' : 'invite');
    const accessToken = hashParams.get('access_token') || params.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || params.get('refresh_token');

    if (code) {
      const { error } = await sb.auth.exchangeCodeForSession(code);
      if (error) throw new Error('O código de acesso não pôde ser validado. Solicite um novo link.');
    } else if (tokenHash) {
      const allowedTypes = ['invite', 'recovery', 'signup', 'magiclink', 'email'];
      if (!allowedTypes.includes(linkType)) throw new Error('O tipo do link de autenticação não é válido.');
      const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: linkType });
      if (error) throw new Error('O link expirou ou já foi utilizado. Solicite um novo e-mail.');
    } else if (accessToken && refreshToken) {
      const { error } = await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) throw new Error('A sessão do link não pôde ser validada. Solicite um novo e-mail.');
    }

    // Remove tokens/códigos da barra de endereço após processá-los.
    if (window.location.search || window.location.hash) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const { data: { session }, error: sessionError } = await sb.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) {
      fail(isRecoveryPage
        ? 'O link de redefinição não gerou uma sessão válida. Solicite uma nova recuperação de senha e abra o link mais recente no mesmo navegador.'
        : 'O convite não gerou uma sessão válida. Solicite ao administrador o reenvio do convite e abra o link mais recente no mesmo navegador.');
      return;
    }

    const { data: { user }, error: userError } = await sb.auth.getUser();
    if (userError || !user) throw userError || new Error('Não foi possível identificar sua conta.');
    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('id,email,full_name,role,must_set_password,is_active')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw new Error('Não foi possível consultar seu perfil: ' + profileError.message);
    if (!profile) throw new Error('A conta foi autenticada, mas não encontramos um perfil associado. Peça ajuda à administração.');
    if (profile.is_active === false) throw new Error('Esta conta está desativada. Entre em contato com a administração.');

    if (!isRecoveryPage && profile.must_set_password !== true) {
      fail('Este convite já foi concluído ou não corresponde a um primeiro acesso pendente. Se você esqueceu sua senha, use a opção “Esqueci minha senha” na página de acesso.');
      return;
    }

    $('#eyebrow').textContent = isRecoveryPage ? 'Área exclusiva · Redefinição de senha' : 'Área exclusiva · Primeiro acesso';
    $('#pageTitle').textContent = isRecoveryPage ? 'Redefina sua senha' : 'Crie sua senha';
    $('#pageIntro').textContent = isRecoveryPage
      ? 'Escolha uma nova senha para voltar a acessar seus pedidos, contratos e remessas.'
      : 'Escolha uma senha pessoal para acessar seus pedidos, contratos e remessas.';
    $('#submitButton').textContent = isRecoveryPage ? 'Salvar nova senha' : 'Criar senha e acessar o portal';
    show('setup');

    $('#passwordForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = $('#password').value;
      const confirmation = $('#confirmation').value;
      const button = $('#submitButton');
      if (password.length < 10) { say('A senha precisa ter pelo menos 10 caracteres.', 'error'); return; }
      if (password !== confirmation) { say('As senhas não coincidem.', 'error'); return; }
      button.disabled = true;
      say('Salvando sua senha com segurança...');
      try {
        // Se uma conta ainda estiver marcada como primeiro acesso, a Edge Function
        // atualiza a senha usando o JWT do próprio usuário e só então libera o perfil.
        if (profile.must_set_password === true) {
          const { data, error } = await sb.functions.invoke('admin-users', { body: { action: 'complete_setup', password } });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
        } else {
          const { error } = await sb.auth.updateUser({ password });
          if (error) throw error;
        }
        let nextPage = 'portal.html';
        if (['reseller', 'collaborator'].includes(profile.role)) {
          const { data: details, error: detailsError } = await sb.from('customer_profiles').select('profile_completed').eq('user_id', user.id).maybeSingle();
          if (detailsError) throw detailsError;
          if (!details?.profile_completed) nextPage = 'completar-cadastro.html';
        }
        show('done');
        $('#doneTitle').textContent = isRecoveryPage ? 'Senha redefinida!' : 'Senha criada!';
        $('#doneText').textContent = nextPage === 'completar-cadastro.html'
          ? 'Sua senha está pronta. Agora vamos completar seus dados cadastrais antes de liberar o portal.'
          : (isRecoveryPage ? 'Sua senha foi atualizada. Agora você já pode entrar novamente no portal.' : 'Sua senha foi criada e sua conta está pronta. Você já pode acessar sua área da Dopamina 3D.');
        say(isRecoveryPage ? 'Senha atualizada com sucesso.' : 'Senha criada com sucesso.', 'success');
        $('#goPortal').textContent = nextPage === 'completar-cadastro.html' ? 'Completar meu cadastro' : 'Entrar no portal';
        $('#goPortal').onclick = () => window.location.replace(new URL(nextPage, window.location.href).href);
      } catch (error) {
        say('Não foi possível salvar a senha: ' + (error.message || 'Erro inesperado.'), 'error');
        button.disabled = false;
      }
    });
  } catch (error) {
    fail(error.message || 'Ocorreu um erro inesperado ao validar o link.');
  }
})();
