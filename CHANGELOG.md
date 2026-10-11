# Changelog

All notable changes to Fitit are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **APK 0.25.0: subir el plan del nutricionista.** Al fondo de `Plan`, `Subir plan` lee un
  PDF y abre `Platos identificados` para revisarlo antes de guardar (#251). Con pauta, cada
  día clava sus kcal y dice lo que no cabe (`Fuera del objetivo: Proteína −25 g`), y
  `Generar otra` desaparece (#252). Bajo cada plato del plan, sus ingredientes con gramos
  (#247).
- **APK 0.24.0: la pestaña Plan y el diario de Comida sin tarjetas.** Barra inferior con
  cinco pestañas (Días · Progreso · Comida · Plan · Perfil). En Comida, tira de la semana
  y lo planificado de hoy dentro de su comida (`Lo comí`, `Lo cambié`, `Me lo salté`); en
  Plan, `Esta semana | La que viene`. Trae también el aviso de platos sin comida y el
  cambio de un plato de la semana (#243).
- **APK 0.23.0: enviar la lista a Taski.** Al pie de `Lista de la compra`, `Enviar a Taski`
  manda la semana a la lista compartida de Taski: sólo lo que no tiene pendiente, sin lo
  marcado `Lo tengo`, con cantidad, categoría y la nota «Plan de Fitit · semana del …».
- **APK 0.22.0: la lista de la compra.** «Ver la semana que viene» → `Lista de la compra`:
  contador `N / M en el carro`, pasillos (Carne, Charcutería, Pescado…), cantidades en
  envases (`3 × 500 g`) o al peso, y `Lo tengo` → `Ya lo tengo`. Además: `¿Te has pesado
  hoy?` al confirmar una comida; la revisión dice cuántos días a medias no cuentan; y
  borrar del diario lo que escribió «Lo comí» deshace la confirmación.
- **APK 0.21.0: Tus platos.** Comida → Tu plan → «Planificar la semana que viene» tiene
  la fila `Tus platos · N`: tus platos con sus comidas (o `Cualquier comida`) y `P` y
  `kcal` por ración; tocar uno abre `Sirve para: Desayuno · Comida · Cena · Snack`.
  «Proponme platos» se muda ahí desde la hoja de añadir. Y el catálogo del súper: 7.865
  envasados de Hacendado y Eroski en la búsqueda y en el escáner, sin red.
- **APK 0.20.0: planificar la semana que viene, con la revisión dentro.** Comida → «Tu
  plan» ofrece `Planificar la semana que viene` cualquier día (o `Ver la semana que viene`
  si ya está generada); antes sólo se podía generar la semana en curso. La hoja pasa
  primero por «¿Apuntaste todo lo que comiste?» —se salta si no toca—, dice
  `Se planifica con tu objetivo de N kcal al día.` y genera la semana del lunes siguiente.
  La revisión ya no tiene día fijo: toca a la semana de la última respuesta. Desaparece la
  tarjeta de revisión de arriba de Comida y la fila `Revisión semanal` de Perfil.
- **APK 0.19.0: el widget 4×2 se lee como la serie.** Arriba `Press banca · 4 series`; en
  medio el tiempo grande (40sp) con pausar y Terminar a la derecha; abajo una fila de dos
  marcos, `− 32,5 kg +` y `− × 12 +`, y el `+1`. Ya no dice `reps`. En el 3×2 (y en
  cualquier widget de menos de 300 dp de ancho o 190 de alto) se queda el bloque de dos
  filas de antes, con las leyendas nuevas (`kg` detrás, `×` delante). Entre el + de los
  kilos y el +1, 6 dp, para que un toque desviado no registre una serie.
- **APK 0.19.0: sin entreno, pestañas con nombre en vez de puntitos.** `Pasos`, `Comida` y
  `Entreno` arriba; el widget recuerda la elegida, también al reiniciar. Pasos dice
  `faltan 1.568`; Comida enseña `118/202 G` y `1460/2569 KCAL` una sola vez, con anillos
  gruesos al estilo de un reloj; Entreno dice cuántos días hace del último, con una franja
  del color de su grupo muscular, y `Empezar entreno`.
- **APK 0.19.0: la notificación, como el widget.** Cerrada, la serie en tinta y el tiempo
  a 30sp con el botón de pausa detrás; desplegada, el tiempo a 40sp y la misma fila de dos
  marcos y `+1` que el 4×2 (sin Terminar).
- **APK 0.18.0: la cuenta atrás del descanso se cuenta con toques.** Tres toques cortos en
  el 3, dos en el 2, uno en el 1 y uno largo que acaba en el cero. Sustituye a pi, pii,
  piiii, cuyo toque largo no llegaba entero. Canal nuevo «Fin del descanso»: si lo tenías
  apagado, apágalo otra vez.
- **APK 0.17.0: con el móvil bloqueado, tocar −/+ en la notificación ya no pide el código.**
  El cuerpo de la notificación del entreno ya no abre la app: un toque fuera de un botón no
  hace nada, y para abrir Fitit se toca la línea del ejercicio (`Press banca`). Varios −/+
  seguidos se pintan una vez, 300 ms después del último; el +1 registra con lo último y se
  pinta al momento.
- **APK 0.17.0: −/+ más grandes en el bloque de ajuste.** Zonas de 52 dp (antes 44; en el
  3×2 bajo del Xiaomi siguen en 44 para que quepa `102,5 kg`) y 6 dp de hueco entre el + de
  los kilos y el +1, para que un toque desviado no registre una serie.
- **APK 0.17.0: en el 4×1, el descanso se vacía.** Mientras descansas, el fondo del widget
  es una barra que se retira de derecha a izquierda con lo que queda; al acabar desaparece.
  El tiempo pasa a 28sp y el +1 a 60 × 56.
- **APK 0.16.1: el último toque de la cuenta atrás acaba en el cero.** La cuenta empieza
  3,8 s antes, así que el toque largo termina cuando el contador marca `00:00`.
- **APK 0.16.0: la cuenta atrás del descanso crece.** Cada toque dura más que el anterior:
  pi, pii, piiii (100, 250, 500 y 800 ms). Canal nuevo «Fin del descanso»: si lo tenías
  apagado, apágalo otra vez.
- **APK 0.15.0: el fin del descanso vibra 3, 2, 1 y el cero.** En vez de dos pulsos al
  llegar a cero, un toque corto en cada uno de los tres últimos segundos y uno largo en el
  cero. Se sigue callando apagando «Fin del descanso» en Ajustes de Android (es un canal
  nuevo: si lo tenías apagado, apágalo otra vez).
- **APK 0.15.0: el botón de pausa se ve en todas partes.** En el 3×2 bajo (el del Xiaomi)
  vuelve el aro ❚❚ junto a Terminar en vez de tocar el tiempo, aunque el nombre se corte
  mientras descansas. Y la notificación lo lleva también, cerrada y desplegada, a la
  derecha del tiempo.

### Added
- **APK 0.14.0: pausar el descanso desde el widget.** En el 4×2 y el 3×2, mientras corre
  el descanso, sale un aro con ❚❚ a la izquierda de Terminar (en el 3×2 bajo, el del
  Xiaomi, no cabe: ahí se toca el propio tiempo). Al tocarlo el tiempo se queda
  quieto en gris y el aro pasa a ▶; tocarlo otra vez sigue desde ahí. En pausa no vibra.
  El 4×1 y la notificación enseñan el tiempo quieto, y Entreno dice `En pausa` con
  `Reanudar`. `+1` en pausa registra y empieza un descanso nuevo.

### Fixed
- **APK 0.13.1: el fin del descanso vibra de verdad.** Con el móvil bloqueado, el aviso de
  fin del descanso llegaba más de un minuto tarde y entonces, a propósito, no vibraba. Ahora
  la alarma es exacta: al llegar a cero vibran los dos pulsos de la 0.10.8, en hora. No
  pide ningún permiso al instalar.

### Added
- **APK 0.13.0: la hoja de «cuánto» recuerda tus cantidades.** Al elegir un alimento desde la
  búsqueda, el campo arranca en la cantidad que más repites para él, y debajo de las raciones
  salen hasta tres chips «Tus cantidades» (`300 g · 5 veces`). Si son raciones exactas se dicen
  así (`2 × rebanada`). Sin historial de ese alimento, todo sigue como antes: 100 g.

### Fixed
- **APK 0.12.2: el widget no se queda vacío hasta abrir Fitit.** Al instalar una APK nueva o al
  encender el móvil, el widget se repinta solo con lo último que tenía (pasos, comida, último
  entreno). Y la pantalla Comida del widget se pone al día con sólo abrir la app, en cualquier
  pestaña; antes había que entrar en Comida.

### Changed
- **APK 0.12.1: los anillos del widget llenan su hueco.** En la pantalla Comida del widget el anillo
  medía siempre 96 dp; ahora crece hasta donde cabe: ≈106 dp en el 3×2 (el ancho lo limita la
  leyenda) y 140 dp en un 4×2. La cifra del centro y el grosor crecen con él.

### Added
- **APK 0.12.0: la comida de hoy en el widget 3×2.** Sin entreno en curso, el widget tiene una
  pantalla nueva entre los pasos y «Empezar entreno»: los dos anillos de Comida (proteína
  fuera, kcal dentro), «84 / g faltan» en el centro y, al lado, «PROTEÍNA 118 / 202 g» y
  «KCAL 1460 / 2569 · quedan 1109». Se llega tocando los puntitos (ahora tres) y, al tocarla,
  se abre Comida. Se pone al día cada vez que abres Comida en el móvil; a las 04:00 se vacía
  sola para el día nuevo. Sin objetivo de proteína, la pantalla no aparece.
- **APK 0.11.1: la tarjeta de macros de Comida, en anillos.** Con objetivo, la proteína es
  un anillo naranja con lo que falta en el centro («84 / g faltan») y las kcal un anillo
  fino por dentro. Al lado, «Proteína 118 / 202 g» y «Kcal 1460 / 2569 · quedan 1109» (o
  «200 de más» si te pasas). Hidratos y grasa van debajo, en dos columnas con su barra. La
  línea «Energía» del pie desaparece: las kcal ya están arriba.
- **APK 0.11.0: aviso de la revisión semanal y Comida/Perfil nuevos.** El día de la revisión (domingo, si no
  eliges otro en Perfil) a las 9:00 llega una notificación, «Revisión semanal · Tu semana está lista. ¿Ajustamos el
  objetivo?», una sola vez y sólo el día de la revisión; al tocarla se abre Comida, donde
  está la tarjeta. Si no hay red o no tienes sesión, no avisa y mañana lo vuelve a mirar.
  Este APK trae además el Perfil rediseñado (filas y hojas, «+ Pesarme»), la línea del
  objetivo en Comida («Sin objetivo todavía · Calcularlo» / «Bajando 0,5 kg/sem · semana 3
  de 10 · 2230 kcal»), el botón «Añadir comida» y la tarjeta de la revisión semanal.
- **APK 0.10.9: Glúteo es un grupo muscular propio.** Hip thrust, puente, patada de glúteo y
  abductor cuentan en Glúteo, no en Femoral, también en el histórico. Sentadilla, prensa y
  zancada suman media serie a Glúteo en vez de a Femoral; el peso muerto, media a cada uno.
  En Progreso, fila **Glúteo** con punto cobre entre Cuádriceps y Femoral, y ficha Glúteo al
  editar el grupo de un ejercicio. La web lo tiene desde el deploy del mismo día; la 0.10.8
  no lo pintaba.

### Fixed
- **APK 0.10.8: el fin del descanso vuelve a vibrar.** La 0.10.7 quitó el aviso, pero en
  el Xiaomi tampoco vibraba. Ahora vibra la propia tarjeta del entreno al llegar a cero:
  dos pulsos, sin sonido y sin notificación nueva. Se puede callar apagando «Fin del
  descanso» en Ajustes de Android. Con el móvil en silencio total no vibra; en vibración,
  sí.

### Changed
- **APK 0.10.7: al acabar el descanso, sólo vibra.** Desaparecen el aviso `Descanso
  terminado` y su sonido. Al llegar a cero el móvil vibra dos veces, también en silencio,
  y lo único en la bandeja sigue siendo la tarjeta del entreno, ya contando en positivo.
  El canal «Fin del descanso» se borra de Ajustes. Si la alarma llega más de un minuto
  tarde, o se saltó el descanso, no vibra.

### Added
- **APK 0.10.6: suena cuando acaba el descanso.** Al llegar el reloj a cero, el móvil
  suena y vibra una vez y aparece `Descanso terminado` con el ejercicio, que se quita solo
  a los 15 s. La tarjeta del entreno sigue muda. Va en su propio canal, «Fin del
  descanso», que se apaga en Ajustes de Android sin tocar la tarjeta. Si la alarma llega
  más de un minuto tarde (teléfono en reposo), no suena. Saltar el descanso o terminar el
  entreno, tampoco. Sólo APK; la PWA no cambia.
- **Un alimento con hueso cuenta la carne, no el hueso.** Muslos, alitas, chuletas,
  costillas, conejo o pescado entero: en la hoja de «cuánto» aparece `Pesado con hueso`
  (encendido por defecto) y debajo la cuenta, «300 g con hueso → 210 g comestibles · 30 %
  de hueso, típico»; los macros salen de la carne. El desperdicio típico sale de una tabla
  corta (`backend/app/refuse.py`, USDA SR Legacy y BEDCA/Moreiras) y lo tuyo manda sobre
  ella. Como la etiqueta no dice si sus kcal son de la bandeja o de la carne, se compara
  con la cifra comestible de CIQUAL: a ±10 % de ella es la carne, a ±10 % de ella diluida
  por el hueso es la bandeja (y no se descuenta nada), y si no cae en ninguna se pregunta
  «¿Las kcal de la etiqueta son de la pieza con hueso o de la parte comestible?» antes de
  dejar añadir. La fila del diario dice «300 g con hueso · 210 g comestibles», y al
  abrirla se puede apuntar el `Hueso que ha sobrado`: corrige la entrada y, si el
  alimento es tuyo, le deja ese hueso medido (el catálogo compartido no se toca).
  `foods.refuse_pct`, `foods.kcal_basis`, `log_entries.edible_grams`;
  `POST /food-log` acepta `with_bone`; `POST /food-log/{id}/bone`.
- **El gasto por fórmula cuenta tus pasos y tus entrenos en vez de adivinar la actividad.**
  Con al menos 7 días de pasos en las últimas 4 semanas, la propuesta de Objetivo parte
  del basal sedentario (Mifflin × 1,2) y le suma lo que cuestan tus pasos (0,0005 kcal
  por paso y kilo) y tus sesiones (4 MET netos × kg × horas, con la duración sacada de
  las series; 45 min si no se puede medir), repartidas en la ventana. Sin pasos sigue la
  escalera por días de entreno. El gasto medido con tus datos sigue mandando. La pantalla
  lo dice: «Estimado con tus 9.200 pasos al día y 45 kcal de entreno».
  `GET /targets/proposal` devuelve `steps_per_day` y `training_kcal_per_day`.

### Fixed
- **Un alimento de CIQUAL sin kcal ya no borra las kcal del día.** 794 alimentos del
  catálogo (el plátano macho, el kéfir, la salsa de tomate…) no traían energía y una sola
  entrada suya dejaba la cabecera de Comida en `—`. Ahora sus kcal se estiman por Atwater
  a partir de los macros y quedan marcadas (`foods.kcal_estimated`). Los 93 a los que
  les falta proteína, grasa o hidratos siguen sin kcal.

### Changed
- **APK 0.10.5: la cámara de Comida vuelve a hacer una foto.** `Abrir la cámara` ya no
  abre el escáner de Google («Powered by Google», sin obturador), que desde el 25 de
  septiembre no había hecho llegar al servidor ni un código ni una lectura de etiqueta.
  Ahora hace una foto: si lleva código de barras se busca en Open Food Facts, y si no lo
  lleva, esa misma foto la lee el modelo como tabla nutricional. Desaparece el aviso «No he
  leído ningún código.».
- **APK 0.10.4: el editor del ejercicio es una hoja, y «Eliminar» en Entreno sólo quita
  de la sesión.** `Editar ejercicio` sube una hoja desde abajo con el nombre, el grupo en
  fichas (se acaba el selector que parpadeaba), la nota y `Eliminar`. En Entreno,
  `Eliminar` quita el ejercicio de ese entreno —con series pregunta: «Se borran sus N
  series de hoy. El historial de otros días no se toca.»— y el ejercicio sigue existiendo;
  borrarlo entero, con su historial, queda sólo en Progreso. Y saltarse un ejercicio en
  cola de «Repetir» ya no borra su historial.
- **APK 0.10.3: los macros ya no se deciden en Perfil.** Desaparece la tarjeta `Macros`:
  `Aceptar` en Objetivo fija las kcal y sus gramos a la vez, y la línea `Proteína … g ·
  Hidratos … g · Grasa … g` de la propuesta dice cuáles serán. Y al guardar un peso, la
  propuesta de Objetivo se recalcula al momento; antes seguía con la del peso anterior
  hasta salir de Perfil y volver.
- **APK 0.10.2: Perfil y Macros en el teléfono.** El APK lleva la web empaquetada, así que
  la pestaña `Perfil` y el cambio a `Macros` (abajo) sólo llegan al teléfono con un APK
  nuevo. Sube de número para que no se confunda con el 0.10.1, que no los lleva.
- **Nueva pestaña `Perfil`: los ajustes salen de Comida, Progreso y Entreno.** La barra
  de abajo pasa a `Días · Progreso · Comida · Perfil`. En Perfil, de arriba abajo:
  - **`Peso`**: la tarjeta de siempre, con el campo `Peso` (antes `Peso de hoy`) y la tendencia. Ya no está en
    Progreso.
  - **`Objetivo`**: la propuesta de kcal con `Quiero`, `kg por semana`, `Altura (cm)`,
    `Año de nacimiento`, `Sexo` y `Pasos al día`.
  - **`Macros`** (antes `Reparto`): `Cuántos gramos de proteína, hidratos y grasa suman
    tus kcal.` Proteína, hidratos y grasa con el total derivado; el botón es `Guardar
    macros` (antes `Guardar objetivos`). **Ya no hay que teclearlos:** la propuesta de
    Objetivo trae sus gramos (`Proteína 156 g · Hidratos 332 g · Grasa 72 g`, con 2 g de
    proteína por kilo de peso, un 25 % de las kcal en grasa y el resto en hidratos) y
    `Aceptar` fija las kcal y los gramos a la vez. Aquí se retocan si hace falta. El
    aviso `te faltan N por repartir` sólo sale a partir de 10 kcal de diferencia: por
    debajo es el redondeo de los gramos.
  - **`Reglas`**: el botón `Tus reglas`.
  - **`Entreno`**: `Descanso` y `Pantalla activa`, que salen del menú `⋯` de Entreno.
  - **`Salir`**, al final; la cabecera ya no lo lleva.

  Comida se queda con el registro: desaparece la fila `Objetivo diario`, y la tarjeta
  de macros sigue comparando con el objetivo fijado en Perfil.

### Fixed
- **APK 0.10.1: borrar un entreno ya no deja al widget y a la notificación en él.**
  Antes seguían enseñándolo (`Dominadas · 5 series`) y su `+1` mandaba series a un
  entreno que ya no existía, que se perdían sin aviso; tocar el widget abría en la app
  una copia del entreno borrado, y borrarlo decía `No se pudo borrar el entreno.`
  Ahora, al borrar el entreno (menú de Entreno) o su día (Días), si el widget y la
  notificación estaban en él vuelven a `Sin entreno en curso` y la notificación se va;
  sus series sin enviar se descartan. Si se borra desde otro sitio (la web, otro
  móvil), el primer `+1` que el servidor rechaza hace lo mismo. Un entreno que ya no
  existe no se vuelve a enseñar desde la copia del móvil: se vuelve a Días. Y borrar
  algo que ya estaba borrado no da error.
- **APK 0.10.1: el widget 3×2 y el 4×2 caben en launchers de menos alto.** El diseño
  pedía 200 dp de alto y dos filas del launcher del Xiaomi dan ≈176: se cortaba la fila
  de reps del bloque. Por debajo de 190 dp el widget se compacta: descansando, el tiempo
  sube a la línea del nombre, a la derecha (y en el 3×2 se quita `· 4 series` mientras
  dura, para que quepa el nombre); las filas del bloque bajan a 44 dp y los márgenes a
  10. Con alto de sobra, igual que antes.

### Changed
- **APK 0.10.0: widgets y notificación del entreno rediseñados.** Fase 6 de
  `docs/widgets-entreno.md`, con el diseño de `DESIGN.md` («Fuera de la app»).
  - **Widget 4×2:** arriba, en una línea, `Press banca · 4 series` (con cola,
    `· 1 sin enviar` en ámbar) y `Terminar` como un aro rojo con ■ en la esquina.
    Descansando, el tiempo debajo en grande. Abajo, el **bloque de ajuste**: dos filas,
    `− 32,5 kg +` y `− 12 reps +`, y a su derecha el botón ámbar **`+1`**, que registra.
    Al pulsar un `−` o `+`, su zona se tiñe y el signo pasa a ámbar.
  - **Pasado el descanso** el número no se cambia por «Descanso terminado»: se vuelve
    ámbar y cuenta lo que te pasas, `+00:12`, en los widgets y en la notificación.
  - **Notificación:** cerrada, `Press banca` / `32,5 kg × 12 · 4 series` con el tiempo
    grande a la derecha; desplegada, `Press banca · 4 series`, el tiempo y el mismo
    bloque de ajuste que el widget, para cambiar peso y reps y registrar desde ahí. Ya no
    tiene botones abajo.
  - **Widget 4×1:** el botón dice sólo `+1`.
  - **Sin entreno, el 4×2 tiene dos pantallas**, que se cambian tocando los puntitos de
    abajo: `Sin entreno en curso` / `Último: hace 2 días · Pierna` con `Empezar entreno`;
    y `PASOS HOY` con los pasos de hoy (`8.432 / 10.000`), una barra hasta el objetivo y
    `Media semanal: 7.910`. Sin pasos de hoy sólo está la primera. El widget recuerda en
    cuál estabas.
  - **`Sesión caducada`:** si el servidor deja de aceptar tu sesión con la app cerrada,
    los widgets dicen `Sesión caducada` / `Abre Fitit para volver a entrar. Tus series
    siguen guardadas.` con un botón `Abrir Fitit` (`Abrir` en el 4×1). Al volver a
    entrar, todo sigue donde estaba y las series pendientes se envían.

### Removed
- **APK 0.10.0: escribir series fuera de la app, saltar el descanso y `Otro ejercicio`.**
  La notificación ya no tiene `+1 serie`, `Otra serie` ni `Otro ejercicio` (y con ellos
  se va escribir `Remo 40x10`); el 4×2 pierde `⏭` y `Otro ejercicio`. Una serie distinta
  se ajusta con `−` y `+`; otro ejercicio se elige en la app, y saltar el descanso
  también se hace en la app.

### Added
- **APK 0.10.0: widget 3×2.** Un tercer widget en el selector, «Fitit · Entreno 3×2»:
  el mismo que el 4×2, en tres columnas.
- **Objetivo: `Pasos al día`.** En Comida → `Objetivo diario`, debajo de `Sexo`. Es la
  meta de la barra del widget; vacío es sin objetivo, y fuera de 1.000–100.000 avisa
  `Entre 1.000 y 100.000 pasos.`

### Changed
- **APK 0.9.1: `Otro ejercicio` del widget 4×2 sólo sirve para añadir uno.** Tocarlo
  abre Entreno con el campo `Ejercicio` enfocado, como hacía `Nuevo…`. Se van la
  lista de cuatro ejercicios con su marca, `Nuevo…`, `Cancelar` y
  `No hay más ejercicios en este entreno.` Cambiar a un ejercicio que ya está en el
  entreno sigue pudiéndose desde la notificación (escribiendo `remo`) o en la app.

### Added
- **APK 0.9.0: cambiar de ejercicio sin abrir la app.** Fase 5 de
  `docs/widgets-entreno.md`. En el widget 4×2, junto a `Terminar`, sale
  **`Otro ejercicio`** (texto apagado). Al tocarlo, el widget enseña hasta cuatro
  ejercicios en dos filas de dos, cada uno con su marca (`Remo con barra` y debajo
  `40 kg × 10`; `Dominadas` y `8 reps`; sólo el nombre si nunca se hizo), más
  **`Nuevo…`** y **`Cancelar`**. Primero los de este entreno que aún no tienen series
  (los añadidos y los que quedan de «Repetir»), después los ya hechos hoy. Tocar uno lo
  pone en curso **sin registrar nada**: la notificación, los dos widgets y la tarjeta
  de Entreno pasan a ese ejercicio, con las series que ya lleve hoy, y el descanso
  sigue. `Nuevo…` abre Entreno con el campo `Ejercicio` enfocado. `Cancelar` vuelve
  sin cambiar nada; sin otros ejercicios en el entreno dice
  `No hay más ejercicios en este entreno.` La notificación gana **`Otro ejercicio`**,
  un campo de texto (`Ejercicio y serie, como Remo 40x10`): `Remo 40x10`,
  `Remo 40,5 x 10` o `Remo 10` registran esa serie de Remo y lo dejan en curso; sólo
  `Remo` cambia sin registrar si es uno de los de la lista, y si no dice
  `Escríbelo con la serie, como Remo 40x10.` Android enseña tres botones como mucho,
  así que mientras corre el descanso el tercero sigue siendo `Saltar`, y
  `Otra serie` entiende también `Remo 40x10`.
- **APK 0.8.0: widget 4×2 del entreno, con ajuste de peso y reps.** Fase 4 de
  `docs/widgets-entreno.md`. En el selector de widgets de Android aparece un segundo
  widget, «Fitit · Entreno 4×2». Con un entreno en marcha: el ejercicio y su grupo, las
  series que van (`4 series`), la cuenta atrás con un botón **`⏭`** para saltar el
  descanso, peso y reps con sus **`−`** y **`+`** (2,5 kg y 1 rep por toque),
  **`Registrar serie`** y **`Terminar`**. Los `−`/`+` no registran nada: cambian la
  serie que registra el siguiente toque, y la notificación y el 4×1 pasan a repetir
  ese peso y esas reps. `Registrar serie` vibra una vez, como `+1 serie`. Con series
  en cola sale ` · 1 sin enviar` en ámbar detrás del contador, y se va cuando llegan
  al servidor. `Terminar` cierra el control: quita la notificación y deja los dos
  widgets en `Sin entreno en curso`; las series ya registradas no se tocan. En un
  ejercicio sin peso no hay botones de kg, sólo los de reps.
- **APK 0.7.0: widget 4×1 del entreno en la pantalla de inicio.** Fase 3 de
  `docs/widgets-entreno.md`. En el selector de widgets de Android aparece
  «Fitit · Entreno 4×1». Con un entreno en marcha enseña el ejercicio y su grupo
  (`Press banca · Pecho`), la cuenta atrás del descanso, la serie que se repite
  (`32,5 kg × 12 · 4 series`) y **`+1 serie`**, que registra sin abrir la app y
  vibra una vez. Al acabar el descanso dice `Descanso terminado`. Sin entreno:
  `Sin entreno en curso`, el día y **`Empezar entreno`**, que abre la app y hace
  lo mismo que el botón de Días (continuar el de hoy o crearlo). Tocar el
  ejercicio, en el widget o en la notificación, abre ese entreno. Colores de la
  maqueta en tema claro y oscuro del sistema, y sus fuentes empaquetadas.
- **APK 0.6.0: registrar series desde la pantalla de bloqueo.** Fase 2 de
  `docs/widgets-entreno.md`. Desde la primera serie de fuerza aparece una
  notificación en curso, silenciosa y visible con el teléfono bloqueado: el
  ejercicio y su grupo (`Press banca · Pecho`), la serie que se repite y cuántas
  van (`32,5 kg × 12 · 4 series`) y la cuenta atrás del descanso. Tres botones:
  **`+1 serie`** registra otra igual sin desbloquear; **`Otra serie`** abre un
  campo para escribir `32,5x10` (vale coma o punto, o sólo las reps), y lo que no
  entiende lo dice en la segunda línea en vez de registrarlo; **`Saltar`** quita el
  reloj. Al acabar el descanso dice `Descanso terminado`, sin sonar. Lo registrado
  desde ahí aparece en la tarjeta de Entreno y se envía en el momento. En Entreno
  → menú (sólo en el APK), **`Terminar entreno`** la quita; sola se va tras dos
  horas sin series. La primera serie del APK pide el permiso de notificaciones.
- **APK 0.5.0: las series las envía Android, no la página.** Fase 1 de
  `docs/widgets-entreno.md`. En el APK la cola de series sin enviar pasa a
  la parte nativa: se guarda en el teléfono y la envía WorkManager en cuanto
  hay red, también con la app cerrada o muerta, en orden y con reintentos. Para
  eso el nativo guarda el token, cifrado con una clave del Keystore de Android.
  La página ya no envía nada en el APK: encola, pide el envío y pinta lo que el
  nativo le cuenta. En pantalla no cambia nada, y la PWA sigue exactamente
  igual. Es la base de la notificación y los widgets (fases 2–4): una serie
  registrada desde fuera de la app irá a esta misma cola.
- **La tarjeta de periodo tiene una referencia, no solo una comparación.** La
  barra de cada músculo se medía contra tu propio músculo más entrenado, así que
  cinco series de pecho llenaban la barra de lado a lado — el gesto de "hecho" —
  solo porque nada las superaba. Ahora se mide contra **20 series semanales**
  fijas, con una marca a las 10, y debajo dice qué significa: *Referencia: 4
  series/semana es el mínimo que produce crecimiento. 10–20 es la zona eficiente.
  Barra llena = 20.* Los números vienen de la meta-regresión de Pelland et al.
  (Sports Medicine, 2026), resumida en `docs/investigacion-series-semana.md`.
  No dice "óptimo" en ningún sitio, porque la curva no tiene pico: tiene
  eficiencia decreciente.
- **Nada de veredictos a media semana.** El lunes todo el mundo está a cero, y
  eso habla del calendario, no del entrenamiento. Mientras el periodo sigue
  abierto la tarjeta avisa: *Semana en curso — la referencia es para la semana
  completa.*

### Changed
- **APK 0.9.0: sin grupo muscular en la notificación ni en los widgets.** El título
  pasa de `Press banca · Pecho` a `Press banca`, en la notificación en curso, en el
  4×1 y en el 4×2.
- **El APK se llama con su versión** (`fitit-0.7.1.apk`), en la Release y en el
  artefacto de cada PR. Ya no se publica la copia `fitit.apk`: en la carpeta de
  descargas no decía qué versión era. El enlace estable pasa a ser la página de la
  última Release, https://github.com/raullopeslopez/fitit/releases/latest (un toque
  más que la descarga directa de antes).
- **"Pierna" se parte en Cuádriceps, Femoral y Gemelo.** Un solo cubo mezclaba
  sentadillas, curl femoral y gemelos, así que "Pierna: 20 series" podía ser
  veinte de sentadilla con el gemelo sin tocar — una cifra que no se puede
  comparar con ninguna referencia. Los ejercicios ya registrados se re-clasifican
  solos por su nombre al desplegar; el que no se entienda se queda en Cuádriceps
  y se corrige con un toque en Progreso · Corregir. El glúteo va con Femoral: los
  ejercicios de cadera que entrenan uno entrenan el otro. La paleta pasa de 7 a 9
  colores, revalidada para daltonismo en claro y oscuro; Cuádriceps se queda el
  rosa que era de Pierna, para que el grueso del historial no cambie de color.

### Removed
- **«Registrar sin abrir» y el aviso de descanso.** Ni la notificación de la PWA
  (service worker) ni la del APK (notificaciones locales) funcionaron nunca de
  forma fiable: las dos intentaban mantener vivo, desde fuera, un estado que
  sólo conocía la página. Se retira entero, en APK y PWA; lo sustituye el
  control nativo que describe `docs/widgets-entreno.md`.

### Fixed
- **Un ejercicio añadido sin series ya no se pierde al salir de la app.** En Entreno,
  añadir un ejercicio y cerrar o dejar la app antes de su primera serie hacía que al
  volver la tarjeta hubiera desaparecido y hubiera que añadirlo otra vez. Ahora sigue
  arriba, donde lo dejaste, hasta que le registras series. Cada entreno
  guarda los suyos: no se cuela en otro día. Pasa igual en la web y en el APK.
  Y uno nuevo añadido por error se puede quitar: en su tarjeta, `Editar ejercicio` →
  `Grupo, nota y eliminar` → `Eliminar ejercicio` → `Sí, eliminar` no hacía nada
  cuando el ejercicio aún no existía en el servidor; ahora quita la tarjeta.
- **«Terminar entreno» dejaba corriendo el descanso de la pantalla** (APK 0.7.1).
  La notificación se iba y el reloj de Entreno seguía contando. Ahora se para con
  ella, y también cuando el control termina fuera de la app (el `Terminar` del
  widget o las dos horas sin series). Un envío de series no lo toca: una sesión
  sólo de cardio no tiene control y su descanso sigue.
- **La notificación del entreno no salía en la pantalla de bloqueo** (APK 0.6.0).
  Su canal era de importancia baja para que no sonara, y Android —Xiaomi el
  primero— esconde del bloqueo lo que trata como «silencioso». Ahora el canal es
  de importancia normal sin sonido ni vibración: se ve con el teléfono bloqueado y
  sigue sin sonar. Canal nuevo («Entreno en curso»); el de la 0.6.0 se retira.
- **Se podía perder una serie registrada sin red.** Las series pendientes llevan
  un id local (`tmp-1`, `tmp-2`…) cuyo contador volvía a empezar cada vez que se
  abría Entreno. Con una serie sin enviar de la vez anterior, la siguiente que
  registrabas sin red se llamaba igual, y al enviarse la primera se borraban las
  dos de la cola: la segunda no llegaba nunca al servidor. El id lleva ahora
  también el momento en que se abrió la pantalla.
- **Una serie reintentada ya no puede entrar dos veces.** Si el servidor guardaba
  una serie pero la respuesta se perdía (red que se corta en el sótano), la cola
  la reenviaba y quedaba duplicada. Ahora cada serie lleva un `client_id` desde
  que se registra, y el servidor reconoce el reintento: contesta 200 con el
  entreno tal cual en vez de crear otra. Es el primer paso de la fase 1 de
  `docs/widgets-entreno.md`, donde la cola nativa del APK lo necesita aún más.
- **"Elevación de piernas" contaba como pierna.** El clasificador veía "pierna"
  dentro del nombre antes de llegar a la regla de abdominales, así que un ejercicio
  de core llevaba meses sumando en el grupo equivocado. Ahora es Core.
- **Series sin peso.** Dominadas, fondos y abdominales no llevan peso, y la app
  exigía uno: dejar el campo vacío guardaba `0 kg`, que es un número — salía en
  la gráfica, podía batir un récord y la fila decía "0×12". Ahora el peso es
  opcional en fuerza (las reps no), un campo vacío viaja como "sin peso" y se
  lee **Corporal × 12** en la fila, en el chip y en el aviso de la pantalla de
  bloqueo, donde además una cifra suelta ya se entiende como reps. Un 0 escrito
  a mano sigue siendo un 0: barra vacía y máquina asistida son valores reales.
- **Eliminar un ejercicio** desde Progreso · Corregir, con un diálogo que dice
  cuántas series se van con él. No había forma de borrar uno: se podía borrar
  serie, entreno y día, pero un nombre tecleado mal se quedaba para siempre en
  el buscador y en los chips.
- **Fusionar duplicados.** Renombrar "Fondo" a "Fondos" cuando "Fondos" ya
  existe devolvía 409 — correcto, pero el aviso salía al pie de la página, tres
  pantallas por debajo del campo, así que en el móvil no lo veías. Ahora la
  queja sale junto al campo y trae la salida real: *Fusionar con Fondos*, que
  mueve las series al ejercicio bueno y borra el duplicado.
- **Cuentas de verdad: cada uno con su propio registro.** Hasta ahora la app era
  de un solo usuario — un usuario y una contraseña en variables de entorno, sin
  tabla `users` y sin `user_id` en ningún modelo. Dar acceso a otra persona
  significaba darle *tu* cuenta, y sus entrenos caían en las mismas tablas que
  los tuyos. Ahora hay tabla de usuarios con contraseñas cifradas (bcrypt),
  `POST /auth/register`, y ejercicios y días pertenecen a quien los creó.
- La pantalla de alta ("Crear cuenta") cuelga del login y te deja dentro al
  registrarte, sin un segundo paso para iniciar sesión.
- El catálogo de ejercicios pasa a ser **por usuario, no compartido**. Es lo que
  hace seguro renombrar: en un catálogo común, uno cambiando "Press banca" se lo
  cambiaba a todos. Dos personas pueden tener su propio "Press banca", y la
  unicidad de nombre de ejercicio y de fecha de día ahora es por persona.

### Security
- **Filtrar las listas no bastaba.** Todos los endpoints que reciben un id
  (`workout_id`, `set_id`, `day_id`, `exercise_id`) lo aceptaban sin comprobar
  de quién era. En cuanto dos personas comparten tablas con ids correlativos,
  eso es leer, editar y borrar los entrenos del otro tecleando un número. Los
  seis comprueban dueño y responden 404 — nunca 403, que confirmaría que la fila
  existe.
- Registro y login devolvían **500** con contraseñas de más de 72 bytes, el
  límite de bcrypt. En una app en español el detalle muerde antes de lo que
  parece: cada tilde y cada ñ ocupan dos bytes, así que una frase de 80
  caracteres ya se pasa. Ahora el alta lo dice (422) y el login simplemente
  rechaza (401). El hash tolera además cualquier entrada sin lanzar, porque la
  migración que siembra la primera cuenta corre como arranque del contenedor:
  ahí una excepción no es una petición fallida, es una app que no levanta.

### Fixed
- Progreso: el resumen por músculo **daba todo en negativo al empezar un mes o
  una semana**. Comparaba un periodo en curso contra uno terminado — el 1 de
  agosto, un día de agosto contra las cuatro semanas de julio — así que cada
  grupo se desplomaba por calendario, no por entrenar menos. Ahora la
  comparación es contra el **mismo tramo** del periodo anterior: nueve días de
  mes contra los nueve primeros del mes pasado, miércoles contra miércoles.
  Además el mes se medía sobre "mínimo una semana", que cogía los tres días que
  llevaba y los dividía entre siete; ahora se mide sobre los días realmente
  transcurridos, y **no hay media semanal hasta que hay una semana** que
  promediar — 12 series el día 1 no son 84/sem. El subtítulo dice cuánto llevas
  ("3.7 semanas", "6 días") mientras el periodo sigue abierto.
- Progreso: el delta salía **contra un tramo vacío**. Comprobado con los datos
  reales del 1 de agosto: el tramo equivalente es el 1 de julio, que fue día de
  descanso, así que cada fila leía su propio valor disfrazado de subida
  (*Pierna 13 series, +13*). La tarjeta ya tenía la regla — un delta contra
  nada no es un delta — pero la condicionaba a *existe mes anterior* en vez de
  a *el tramo comparado tiene volumen*. Ahora el delta y el "vs." del pie
  desaparecen juntos cuando no hay con qué comparar.
- Progreso: un músculo que **dejabas de entrenar desaparecía** del resumen en
  vez de aparecer a cero. La tarjeta responde a "¿entreno lo que creo?" y
  escondía justo el caso que hay que ver: ahora *Espalda 0 series, −6*.
- Progreso: las barras **no sumaban el total** del subtítulo y nada lo explicaba.
  El cardio no tiene grupo muscular por diseño y un ejercicio que el
  clasificador no reconoce tampoco, así que esas series contaban como volumen
  sin pintar ninguna fila. Ahora se dicen aparte: *3 series sin músculo
  asignado*.
- Progreso: el calendario **no cabía en el móvil**. Quince semanas de celdas de
  21px más una columna de siete chips a la derecha son medio metro de contenido
  en una tarjeta de 320px: el grid salía recortado por los dos lados, las
  etiquetas de día se caían por la izquierda y los chips seguían por debajo del
  calendario. Ahora son diez semanas — dos meses y medio, que es el rango que
  la pregunta necesita — y los chips van bajo el grid en una línea que se
  desliza, como los del buscador.
- Progreso: en el resumen mensual, `6.2 series/sem` partía en dos líneas dentro
  de su columna y rompía el ritmo de todas las filas. El pie ya dice que son
  medias semanales de series, así que la fila solo pone `6.2/sem`.
- Progreso: cada fila del resumen mostraba un delta igual a su propio valor
  (`+6.2`, `+4.6`…) cuando no había mes anterior con el que comparar. Sin
  periodo previo la columna queda vacía.
- Progreso: los chips de músculo estaban en la tarjeta del buscador, al final
  de la pantalla, así que para cambiar de qué iba la gráfica había que pasar por
  delante de ella. Ahora viven en la tarjeta que gobiernan.
- Progreso: la etiqueta del último récord de la gráfica se salía por el borde
  derecho (`30 × 15` se leía `3(`). Las etiquetas pasada la mitad del ancho se
  cuelgan hacia dentro.
- Progreso: `Corregir` se colaba entre el nombre del ejercicio y la gráfica,
  donde parecía un segundo encabezado. Vuelve al pie de la tarjeta.

### Changed
- **Progreso responde otra pregunta.** El calendario ya no mide constancia: el
  color es el músculo y la opacidad las series, así que de un vistazo ves si
  llevas dos semanas sin tocar pierna. Los chips de la derecha son la leyenda y
  el filtro a la vez. En su sitio hay además una tarjeta de resumen — series por
  músculo en la semana o el mes, con la diferencia contra el periodo anterior y
  flechas para ir hacia atrás.
- **Evolución sustituye a la gráfica de 1RM estimado y a "Mejores marcas".**
  Escalones en vez de pendiente: solo las sesiones en las que el peso subió de
  verdad. La curva anterior trazaba línea también por los días en que solo
  mantenías, y eso se lee como un progreso que no ocurrió.
- **Entreno encabeza con lo que pusiste en la barra**, no con un 1RM estimado:
  "Última vez · hace 3 días" y la serie tope de aquel día. El récord se marca en
  la fila que lo tomó, con la etiqueta `PR peso`, y ahora es un récord de peso
  real — más kilos que nunca a ese número de reps o más — en lugar de una
  fórmula por la que un single pesado ganaba a una serie dura de ocho. Fuera el
  banner: tapaba el log un momento y no dejaba nada detrás.
- **Repetir serie pasa a la fila de Registrar**, en gris. El log de hoy vuelve a
  numerar las series (S1, S2…) sobre filas en cebra, y las tarjetas plegadas
  enseñan las series de hoy como chips.
- **Jerarquía de tarjetas**: el ejercicio en curso lleva un lavado ámbar, la
  tarjeta protagonista de cada pantalla se eleva y lo ya hecho se hunde hacia el
  fondo. Con el dedo, ninguna fila tocable se tiñe de ámbar: solo velo gris
  mientras pulsas.
- **Marca nueva**: el icono es una barra cargada vista de frente, que de paso
  insinúa una F — al revés que el anterior, que era una F recortada sobre un
  cuadrado naranja. Iconos de app, badge y favicon nuevos.

### Removed
- Progreso: racha de días, constancia semanal, heatmap por intensidad de series,
  "Mejores marcas" y los avisos de músculo desatendido.

### Fixed
- Entreno: la notificación **saltaba cada vez que salías de la app**, no solo al
  bloquear el móvil. "Oculta" también es abrir WhatsApp o mirar la música, y
  como el reanuncio tiene que sonar para contar como una llegada, el arreglo de
  la pantalla de bloqueo se convirtió en un banner interrumpiendo cualquier otra
  cosa. La unidad correcta es la serie, no el cambio de app: registrar una serie
  da derecho a **una** llegada, que se gasta al ocultarse la app la primera vez;
  la siguiente hay que ganársela levantando algo.
- Entreno: el icono pequeño de la notificación (barra de estado y el círculo de
  la propia notificación) era un bloque gris sin forma. Apuntaba al icono de la
  app, y Android no dibuja ese hueco como una imagen: se queda con la silueta,
  tira el color y tiñe lo que queda. Un cuadrado naranja opaco de borde a borde
  silueta como un cuadrado, así que la F nunca salía. Nuevo `badge-96.png`: la
  misma F, blanca sobre transparente y nada más. El icono grande no cambia.
- Entreno: la notificación **no llegaba a la pantalla de bloqueo** salvo cuando
  el descanso terminaba — y con `Descanso: Sin`, nunca. Estaba en el cajón, con
  sus botones, y ahí se quedaba. La diferencia no era el contenido sino el
  momento de llegada: Android dibuja en el bloqueo lo que **llega** estando
  bloqueado, y no repinta lo que ya estaba en el cajón. El aviso de fin de
  descanso cumplía esa condición por casualidad; la notificación que nace al
  pulsar `Registrar` no podía cumplirla nunca, porque en ese instante el móvil
  está desbloqueado y en tu mano. Ahora la app avisa al worker cuando se oculta
  —que es justo cuando el móvil va al bolsillo— y la notificación llega otra vez,
  bajo la misma etiqueta. Sin temporizadores adivinando cuánto tardas en
  guardarte el móvil.

### Added
- Entreno: bajo `Registrar sin abrir`, una línea que dice si el aviso está vivo
  de verdad — `Activo · última a las 18:41`, o el motivo cuando no lo está. La
  notificación la construye otro hilo y la muestra el sistema, así que la app no
  veía nada de su propia función: el worker sin despertar, el worker fallando,
  el permiso revocado por detrás y Android descartando la notificación eran
  cuatro problemas distintos con la misma cara — la de que no pasa nada. La
  entrega es ahora de ida y vuelta y el worker contesta `{ ok, shown }`, con
  `shown` leído de `getNotifications`: `ok` con `shown: 0` aísla "el sistema no
  se quedó nada" de cualquier fallo del worker.

### Fixed
- Entreno: la notificación de descanso **llegaba al panel pero no a la pantalla
  de bloqueo**, que es el único sitio donde sirve. La marcaba como `silent` para
  no molestar en cada serie, y Android se lo toma al pie de la letra: varias
  capas (One UI entre ellas) esconden del bloqueo las notificaciones
  silenciosas. Ahora el silencio lo lleva `renotify: false` — una sustitución
  bajo la misma etiqueta no vuelve a avisar, así que suena una vez al aparecer
  en la sesión y luego se actualiza sin ruido, serie tras serie. El fin del
  descanso y el acuse de una serie tecleada sí piden ser oídos. Silenciarla del
  todo es una preferencia legítima y vive en el canal por sitio de Android.

### Changed
- Entreno: el descanso y el registro desde la pantalla de bloqueo pasan a ser
  **dos ajustes independientes**. `Aviso de descanso` se llama ahora
  **`Registrar sin abrir`** y va por su cuenta; `Descanso` solo decide si esa
  notificación además lleva cuenta atrás y pita al terminar. Antes estaban
  pegados, así que elegir `Sin descanso` quitaba también el botón `+1 serie` —
  y "no cronometro los descansos" no es lo mismo que "no quiero registrar desde
  el bolsillo". Sin descanso, la notificación sale con el ejercicio de título y
  sin reloj. Saltar el descanso ya no la cierra: se reenvía sin cuenta atrás,
  porque saltarse un descanso no es salirse de la sesión. La preferencia
  anterior se lee una vez como valor inicial de la nueva.
- Entreno: la notificación de descanso cambia `Saltar` por un **campo de texto**,
  así que una serie con otro peso o reps (`32.5x12`) también se registra desde la
  pantalla de bloqueo — pirámides y drop sets, que antes no tenían ninguna vía.
  Android solo da dos acciones, y `Saltar` era la prescindible: deslizar ya
  descarta la notificación y el descanso se agota solo. El parser acepta
  `32,5 x 12`, `30kg x 8` o `60 5`, pero no adivina: un número suelto es
  ambiguo entre peso y reps, y una serie inventada es peor que una no
  registrada. Lo que escribes pasa a ser también lo que repite `+1 serie`.

### Added
- Entreno: the rest countdown goes to the Android lock screen as a notification
  with a **`+1 serie`** button, so a straight set is one tap on a phone you never
  take out of your pocket. The service worker owns it (the page is frozen while
  the screen is off): it is handed the set to repeat, the token to send it with
  and the page's own unsent count, writes the set to disk before the network,
  and refuses to send while older sets are still queued in the app — `set_index`
  is assigned in arrival order. Unsent sets are handed back when the app comes
  forward, and the outbox stays the only thing that drains. Off until switched
  on in the header `⋯` (it needs a notification permission, and a permission is
  only ever asked for from a tap). Cardio blocks get no repeat button: the
  interval you just ran is not the one you are about to run.
- Entreno: a screen Wake Lock while a session is open, so the phone stops
  locking itself between sets. On by default, `Pantalla activa` in the header
  `⋯` turns it off. Re-taken whenever the app comes back, since Android drops it
  the moment the tab is hidden.

### Fixed
- Accessibility: the amber accent now clears WCAG AA (4.5:1) everywhere, the
  floor `DESIGN.md` mandates. White text on filled buttons failed AA in both
  themes (3.70 light, 2.86 dark) — buttons now use a near-black `--on-accent`
  ink (5.8 / 6.23). Amber used as text (Salir, the active tab, the "HOY" badge,
  the stepper `+`) takes a deeper `--accent-ink` (`#C2440F`) so it passes on the
  paper background, and light `--muted` went `#6B7280` → `#616875` (4.32 → 5.01
  on paper). Amber hues unchanged. Also dropped a dead `.previous strong` rule
  and added `text-wrap: balance` to headings.

### Changed
- Database moved from Render's managed Postgres to [Neon](https://neon.tech)
  serverless Postgres; Render now hosts only the web service. Dropped the
  `databases:` block from `render.yaml` and made `DATABASE_URL` a dashboard secret.
  `config.py` now normalizes Neon connection strings — translating libpq
  `sslmode` to the asyncpg `ssl` param and dropping `channel_binding` (which asyncpg
  rejects) — alongside the existing asyncpg-driver coercion (`test_config.py`).

### Added
- Project scaffold: React (Vite) frontend, FastAPI + Postgres backend on uv,
  Docker Compose for local dev, GitHub Actions CI (specs + lint + migrations),
  README and this changelog.
- Data model: `exercises`, `workouts`, `sets`.
- Spec-driven setup: Gherkin `.feature` files (`log_set`, `previous_marks`,
  `correct_set`) with `pytest-bdd`. First scenario (log a set) is intentionally
  red — the endpoint returns `501` until implemented.
- Working endpoints: `GET /health`, `POST /exercises`, `POST /workouts`,
  `GET /workouts/{id}`.
- `POST /workouts/{id}/sets` — log a set: creates the exercise on first use and
  assigns the next set index. First green slice (`log_set.feature`).
- Hardened input validation (Pydantic): `unit` restricted to `kg`/`lb`, `reps`
  1–1000, `weight` 0–1000 (0 = bodyweight), and names trimmed + non-empty.
- Unit test tier in `backend/tests/unit/` (schema validation), separate from the
  Gherkin integration specs.
- `GET /exercises/previous?name=` — previous marks: the sets from the most recent
  workout that includes an exercise; `found` is false when it was never logged
  (`previous_marks.feature`). Second green slice.
- `PATCH`/`DELETE /workouts/sets/{id}` — correct a logged set (fix its values) or
  remove it (`correct_set.feature`). Third green slice. `get_or_create_exercise`
  extracted as a shared helper.
- Single-user auth (`auth.feature`): `POST /auth/login` checks a username/password
  from the environment (`AUTH_USERNAME`/`AUTH_PASSWORD`) and returns a JWT; all
  `/workouts` and `/exercises` routes now require a bearer token (`/health` and
  `/auth` stay public). Fourth green slice.
- Frontend login screen (React): a `Login` form that posts to `/auth/login`, stores
  the JWT, and shows an error on bad credentials; `App` gates on the token. Built
  test-first with Vitest + React Testing Library (`Login.test.jsx`, `App.test.jsx`),
  now run in CI.
- Authenticated API client (`apiFetch`): attaches the stored JWT, prefixes `/api`,
  returns JSON (or `null` for 204), and on 401 clears the token and drops back to
  the login screen. Tested with Vitest (`api.test.js`).
- Workout screen (React): starts a workout, and adding an exercise shows its
  previous marks inline (`Last time: 60 kg x 8`, or "no previous marks yet"); logged
  sets appear in a list. The core log-and-beat loop, wired through `apiFetch`. Tested
  with Vitest (`Workout.test.jsx`).
- UI polish: a `styles.css` design system (cards, inputs, buttons, green accent,
  tabular set numbers, **dark mode** via `prefers-color-scheme`, mobile-first), plus
  loading (`Checking…`/`Logging…`), empty ("no sets yet"), and error (`role="alert"`)
  states across the login and workout screens. Error handling covered by a Vitest test.
- Production deploy: `render.yaml` Blueprint (web service + managed Postgres,
  migrations on pre-deploy, health check `/api/health`) and a multi-stage `Dockerfile`
  that builds the React app and serves it + the API from one FastAPI service
  (`app/web.py` mounts the API under `/api`, the static React app at `/`).
  `DATABASE_URL` is coerced to the asyncpg driver so Render's connection string works.
  Covered by unit tests (`test_web.py`, `test_config.py`).
