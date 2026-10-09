# KRONOS MCP — Guion de demostración

Duración: 3 minutos.
Audiencia: desarrolladores y pequeños equipos técnicos.

## 1. Problema
KRONOS MCP conecta clientes compatibles con MCP a la API existente de KRONOS mediante stdio.

## 2. Herramientas
- kronos_contracts: contratos declarados.
- kronos_me: identidad autenticada y permisos.
- kronos_status: resumen del estado.
- kronos_health: salud de la API ascendente.

Las cuatro herramientas son de solo lectura.

## 3. Seguridad
Las herramientas protegidas requieren sus permisos correspondientes.
La autorización falla de forma segura si no puede verificarse la identidad.
Estas características no constituyen una certificación de seguridad.

## 4. Evidencia
Pruebas locales: npm test; 65 pruebas aprobadas en la última ejecución.
Verificación en vivo: siete comprobaciones aprobadas en la última ejecución.
Ambas evidencias deben presentarse por separado.

## 5. Límites
No ofrece todavía generación de contenido con IA, conectores arbitrarios,
ni operaciones de publicación o eliminación de datos.

## 6. Protección
No mostrar tokens, archivos .env, cabeceras de autorización ni datos privados.
No ocultar fallos ni presentar pruebas automatizadas como auditoría independiente.
