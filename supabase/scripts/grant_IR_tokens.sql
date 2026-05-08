
-- Liberar por e-mail
UPDATE public.users
SET ir_module_enabled = TRUE
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'email@do.usuario'
);

-- Verificar quem tem acesso
SELECT u.id, au.email, u.ir_module_enabled
FROM public.users u
JOIN auth.users au ON au.id = u.id
WHERE u.ir_module_enabled = TRUE;

-- Revogar (se necessário)
-- UPDATE public.users SET ir_module_enabled = FALSE
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'email@do.usuario');