# ADR-001: Reconstrucción y Gobernanza del Schema de Base de Datos

## Estado
**APROBADO** (2026-07-15)

## Contexto
Panorama Informativo carecía de un esquema de base de datos único, centralizado y reproducible. La base de datos operacional (`newsdb`) se construyó históricamente a través de la ejecución secuencial de aproximadamente 60 scripts a lo largo del historial de Git. Esta aproximación procedural acumuló deuda técnica:
- Algunos scripts contenían errores de sintaxis o incompatibilidades con PostgreSQL 15, haciendo imposible levantar el sistema desde cero en una base vacía.
- Existían "tablas fantasma" (`ai_usage_log` y `domain_failures`) que eran consumidas por el código vivo pero nunca fueron declaradas formalmente en los scripts de migración.
- Algunos scripts mezclaban DDL estructural con lógica de backfill dependiente de datos operacionales preexistentes, rompiendo la reproducibilidad.

## Decisión
Para consolidar la persistencia como un componente gobernado, adoptamos las siguientes decisiones arquitectónicas:

1. **Artefacto de Distribución de Base de Datos Baseline Oficial:**
   Establecer `schema_baseline.sql` en la raíz del proyecto como el artefacto oficial de distribución para la creación limpia de la base de datos estructural. La fuente de verdad del diseño fluye desde las migraciones hacia el bootstrap, el cual genera este archivo. Queda terminantemente prohibido editar este archivo de forma manual.

2. **Inicialización Determinista (`bootstrap`):**
   Implementar `npm run bootstrap` como el comando obligatorio de inicialización que:
   - Clona variables de entorno.
   - Aplica el baseline estructural `schema_baseline.sql` de forma directa en bases de datos vacías.
   - Inserta únicamente semillas "core" del sistema (categorías estructurales, settings del sistema, roles) excluyendo datos de negocio editoriales (fuentes RSS), las cuales se manejan a demanda con `npm run import-sources`.

3. **Clasificación por Operación, No por Archivo:**
   Adoptar la regla de que las migraciones deben separarse según la naturaleza de sus operaciones:
   - **DDL Estructural (Bootstrap):** Operaciones idempotentes de creación/modificación de tablas, columnas e índices que el código vivo necesita para iniciar.
   - **Lógica Backfill / Seed (Data Dependent):** Actualización y recalculación de datos de negocio que requieren datos históricos reales.

4. **Trazabilidad Interna con `schema_version`:**
   Declarar la tabla `schema_version` dentro del baseline para registrar el hash SHA-256 de la estructura cargada, el commit de Git de origen y la fecha de instalación, permitiendo validaciones estructurales en caliente.

5. **Firma y Manifiesto Integrado:**
   Utilizar `schema_manifest.json` y el script de resguardo `npm run backup -- --quick` como el único mecanismo oficial para regenerar el baseline, documentar la topología activa y calcular firmas criptográficas SHA-256 que impidan alteraciones silenciosas.

6. **Validación Automática en CI:**
   Integrar un workflow de GitHub Actions que, ante cada push/PR, levanta un PostgreSQL 15 vacío, ejecuta el bootstrap, valida el conteo exacto de tablas y ejecuta un backup rápido para asegurar que no se introducen regresiones estructurales.

7. **Política de Modificación del Schema:**
   Ningún Pull Request podrá modificar directamente `schema_baseline.sql`. Toda alteración estructural deberá obligatoriamente introducir un nuevo script de migración, pasar con éxito el bootstrap limpio de la base de datos, y utilizar `npm run backup -- --quick` en el entorno de desarrollo para regenerar de manera automatizada el baseline, el manifiesto firmado y el mapa.

## Consecuencias
- **Positivas:** 100% de reproducibilidad garantizada del sistema completo desde un clon limpio. Los desarrolladores y pipelines de CI pueden levantar y probar Panorama en menos de 2 minutos.
- **Positivas:** Detección temprana y bloqueo en CI de cualquier cambio que rompa la estructura de la base de datos.
- **Neutrales:** Mayor disciplina requerida al modificar el esquema: los cambios estructurales deben realizarse mediante nuevos scripts de migración y la actualización del baseline debe hacerse exclusivamente a través del script de backup.
