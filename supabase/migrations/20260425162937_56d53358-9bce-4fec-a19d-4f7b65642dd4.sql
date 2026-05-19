-- Concede as novas permissões 'chamados_os.visualizar' e 'chamados_os.criar'
-- a todo perfil de acesso que já tenha 'painel_os.visualizar'
-- (mesmo critério dos demais submenus de O.S. — administrador já recebe tudo automaticamente).
INSERT INTO public.permissoes_perfil (perfil_acesso_id, permissao)
SELECT DISTINCT pp.perfil_acesso_id, 'chamados_os.visualizar'
FROM public.permissoes_perfil pp
WHERE pp.permissao = 'painel_os.visualizar'
ON CONFLICT DO NOTHING;

INSERT INTO public.permissoes_perfil (perfil_acesso_id, permissao)
SELECT DISTINCT pp.perfil_acesso_id, 'chamados_os.criar'
FROM public.permissoes_perfil pp
WHERE pp.permissao = 'painel_os.criar'
ON CONFLICT DO NOTHING;

-- Garante visibilidade do menu para perfis que já tenham permissões de menu de O.S.
INSERT INTO public.permissoes_menu_perfil (perfil_acesso_id, menu_key)
SELECT DISTINCT pmp.perfil_acesso_id, 'menu.os.chamados-os'
FROM public.permissoes_menu_perfil pmp
WHERE pmp.menu_key = 'menu.os.painel'
ON CONFLICT DO NOTHING;