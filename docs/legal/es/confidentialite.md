# Política de privacidad

**Última actualización:** 7 de octubre de 2026

## 1. Introducción

La presente política de privacidad describe cómo **Le Pillaveur** (en adelante, el «Servicio»), editado por **Simon Cozzi**, recoge, utiliza y protege sus datos personales conforme al Reglamento General de Protección de Datos (RGPD) y a la ley francesa de Informática y Libertades.

**Contacto de datos personales:** lepillaveur@outlook.fr

## 2. Responsable del tratamiento

- **Responsable:** Simon Cozzi
- **Dirección:** disponible previa solicitud a lepillaveur@outlook.fr

## 3. Datos recogidos

### 3.1 Datos de cuenta (registro)

Al crear una cuenta, recogemos:

- dirección de correo electrónico;
- contraseña (almacenada como **huella criptográfica** — nunca en claro);
- apodo (nombre visible).

Si crea su cuenta o inicia sesión **con Google** (botón «Continuar con Google» o, en la aplicación móvil, ventana de inicio de sesión de Google), o si vincula una cuenta de invitado a Google, no se registra ninguna contraseña. Una vez aceptado el inicio de sesión en la ventana de Google, Google nos transmite su dirección de correo electrónico, el identificador de su cuenta de Google y, según la configuración de esa cuenta, su nombre (nombre de pila y apellidos) y su foto de perfil; nuestro servidor hace verificar esta información por Google. Solo conservamos la dirección de correo electrónico, que identifica su cuenta. Al crear la cuenta, su nombre de pila (o, en su defecto, su nombre completo o, si también falta, la parte de su dirección de correo electrónico anterior a la @) sirve para proponer su apodo inicial, visible para los demás jugadores y modificable desde la página Cuenta; el identificador de la cuenta de Google y la foto no se conservan, y el nombre solo se conserva a través de ese apodo inicial. Google trata por su parte sus datos de inicio de sesión (véase 6).

### 3.2 Datos de juego

Si utiliza una cuenta, podemos almacenar:

- estadísticas de partidas (número de partidas, victorias, derrotas);
- contadores de «tragos» (unidades lúdicas abstractas, sin relación con un consumo real);
- logros desbloqueados;
- progresión en línea (experiencia, nivel, cosméticos) y resultados de partidas en línea (clasificaciones);
- lista de amigos (solicitudes enviadas y aceptadas);
- estado «en línea» visible para sus amigos: solo indica si su cuenta ha tenido actividad en el sitio en los últimos 3 minutos (fecha de última actividad de la cuenta), haya aceptado o no las estadísticas de visita; no se les comunica ni la hora exacta ni su historial;
- lista de jugadores sincronizada (apodos locales que usted crea).

En **modo local** (sin cuenta), sus jugadores locales se almacenan en su dispositivo. Sin embargo, la lista de sus apodos puede transmitirse al servidor en dos casos: si ha **aceptado las estadísticas de visita** (véase 3.3 — la lista sirve entonces también para la detección de robots), o si está **conectado a una cuenta** (sincronización entre dispositivos). Si rechaza las estadísticas y no tiene cuenta, estos apodos no salen de su dispositivo.

### 3.3 Datos técnicos y de uso

**Con su consentimiento** (opción «estadísticas de visita», propuesta al entrar en el sitio y modificable en cualquier momento mediante el enlace «Estadísticas de visita» del menú y del pie de la página de inicio), recogemos, para estadísticas de audiencia consultables por la administración del sitio:

- identificador del navegador (cookie `lp_vid`, 1 año);
- dirección IP;
- país estimado a partir de la dirección IP (geolocalización aproximada): indicado por Cloudflare, a través del cual pasan las solicitudes dirigidas al sitio (véase 6), o, en su defecto, calculado en nuestros servidores con una base de datos de geolocalización local;
- tipo de dispositivo / navegador (user-agent simplificado);
- fechas de sus visitas al sitio (páginas mostradas y actividad), así como la última cuenta utilizada en este navegador y la fecha de su último uso con la sesión iniciada (para distinguir un navegador que sigue conectado a esa cuenta de otro en el que solo se utilizó anteriormente);
- los nombres de sus jugadores locales (véase 3.2);
- si está conectado a una cuenta, el historial de **visitas** de esa cuenta, descrito a continuación.

Una **visita** es un periodo de uso del sitio sin interrupciones de más de 30 minutos, sumando todas las pestañas y todos los dispositivos; solo se tienen en cuenta los navegadores en los que se han aceptado las estadísticas de visita. Para cada visita registramos su inicio, su última señal de actividad (el final se fija en esa señal más un minuto), el tiempo con la página mostrada y en uso, el **tiempo activo** (la parte de ese tiempo en la que se había utilizado la página — clic, tecla, toque en la pantalla o rueda del ratón — en los 10 minutos anteriores), el **tiempo en partida** (la parte pasada en una página de juego en modo local o durante una partida en línea iniciada: es una estimación, deducida de la pantalla mostrada) y el tipo de dispositivo (móvil, tableta, Mac o PC). Con una visita no se registra ninguna dirección IP, dirección de página, juego ni apodo. Las cuentas del equipo de moderación no tienen historial de visitas: el de un jugador que se une al equipo se borra.

La administración del sitio puede consultar el historial de visitas cuenta por cuenta; ni los moderadores ni los demás jugadores tienen acceso a él. Al consultarlo, cada visita se relaciona con las partidas en línea iniciadas durante ella (registro de partidas, véase 3.4) y se calculan totales de 7 y 30 días. La cronología solo muestra el día, la duración y una franja horaria (madrugada, mañana, tarde o noche, hora de París); la hora exacta solo aparece en el detalle de una visita.

Las visitas también sirven, al consultar los datos y sin ningún dato adicional, para estadísticas de uso de conjunto que solo puede consultar la administración del sitio: número de cuentas activas y de jugadores únicos, cuentas nuevas y cuentas que regresan, regreso de las cuentas creadas recientemente al menos 1 día y luego al menos 7 días después de su creación, duración mediana de una visita, tiempo activo mediano por cuenta y parte del tiempo pasada en partida. Estas estadísticas no nombran a ninguna cuenta, salvo una lista interna de las 10 cuentas más activas en 7 días, que indica para cada una su tiempo activo y su número de partidas en línea (véase 3.4): nunca se muestra a los jugadores ni a los moderadores, y no da lugar a ninguna recompensa, recordatorio ni medida relativa a las cuentas que figuran en ella. Las cuentas del equipo de moderación y las cuentas de prueba quedan excluidas de estas estadísticas (véase 3.4).

Si lo rechaza, no se registra ningún seguimiento de visita. Si retira su consentimiento (enlace «Estadísticas de visita» y, después, «Rechazar»), los datos recogidos por este concepto en este navegador (dirección IP, país, dispositivo, nombres de los jugadores locales, fechas de visita, direcciones IP registradas sin sesión iniciada, registros diarios de visita) se borran inmediatamente y se retira la cookie `lp_vid`; el historial de visitas de la cuenta conectada en ese momento también se borra, en todos los dispositivos. Rechazar en un navegador en el que no había aceptado las estadísticas de visita (un dispositivo nuevo, por ejemplo) no borra ese historial. La elección vale para este navegador: en otro navegador en el que las hubiera aceptado, las visitas se siguen registrando mientras no las rechace también allí.

Anteriormente, al entrar en el sitio, estas estadísticas se presentaban como anónimas y destinadas únicamente a contar las visitas, lo cual no era cierto (identificador del navegador, direcciones IP). El consentimiento dado con ese texto anterior ya no se tiene en cuenta: se le vuelve a plantear la pregunta. Con este cambio se suprimieron los nombres de los jugadores locales y las direcciones IP registradas sin sesión iniciada, así como los datos de los navegadores nunca utilizados con una cuenta. En un navegador utilizado con una cuenta, la última dirección IP, el país, el dispositivo, las fechas de visita y la última cuenta utilizada se conservan hasta la siguiente visita de ese navegador al sitio, en la que se borran junto con la cookie `lp_vid`, y como máximo 6 meses después de su última visita. Los registros diarios de visita de cada navegador (identificador del navegador y fecha, sin dirección IP, nombre ni cuenta) se conservan hasta su purga a los 13 meses.

**Independientemente de este consentimiento**, únicamente para las **cuentas conectadas**, conservamos la dirección IP, el país estimado y el tipo de dispositivo registrados al crear la cuenta y en las últimas conexiones, así como la fecha de última actividad de la cuenta, actualizada solo cuando el sitio se utiliza realmente (página mostrada y alguna interacción en los últimos 30 minutos) o al autenticarse, que también sirve para el estado «en línea» visible para sus amigos, para el número de cuentas en línea (un recuento, sin nombres) y para la eliminación automática de las cuentas de invitado inactivas; no se registra ningún tiempo de presencia por este concepto. Finalidades: **seguridad y moderación de cuentas** (prevención de fraudes, baneos), estado «en línea», número de cuentas en línea y eliminación de las cuentas de invitado inactivas — base: interés legítimo.

Se considera actividad el uso de una página mostrada en pantalla: se envía una señal como máximo una vez por minuto, solo mientras la página está visible y usted la ha utilizado (clic, tecla, toque en la pantalla o rueda del ratón) en los últimos 30 minutos. Solo se conserva el momento de su última interacción, en la memoria de la página y sin su contenido; no se registra ni se transmite. Sin su consentimiento, la señal no contiene nada más y solo sirve para la fecha de última actividad de una cuenta conectada (véase más arriba): no se registra ninguna duración a partir de ella. Con su consentimiento, solo indica además «activo o no» y «en partida o no», y sirve para medir la duración de las visitas de su cuenta si está conectado (véase más arriba); no se registran ni la dirección de la página, ni el juego, ni el número de interacciones. El acumulado de tiempo de presencia calculado antes del 13 de septiembre de 2026, con un método abandonado que también contaba las pestañas que quedaban abiertas, se ha puesto a cero; ya no se actualiza ni se muestra.

En las herramientas de moderación del sitio, las direcciones IPv6 de una misma red (mismo prefijo /64, por lo general un mismo router o un mismo lugar) se agrupan en la visualización: esta agrupación se calcula al consultar los datos y no almacena ningún dato adicional.

### 3.4 Chat y partidas en línea

Los mensajes enviados en el **chat** (chat de partida y mensajes entre amigos) se almacenan en nuestros servidores y pueden someterse a un filtrado automático de lenguaje inapropiado. Se conservan un máximo de **12 meses** y luego se eliminan. El estado de las partidas en línea (jugadas, votos, dibujos) es temporal y se elimina junto con la mesa de juego. En cambio, conservamos un **registro de explotación** de las partidas iniciadas — juego, fecha, duración de la mesa, motivo de finalización (terminada, revancha, salida de los jugadores, cerrada por el equipo, abandonada) y participantes — durante **12 meses**, para seguir el uso del servicio y tramitar las denuncias. La administración del sitio puede consultar este registro **cuenta por cuenta** (partidas iniciadas, sesiones de juego y duración de las mesas en las que participó la cuenta; para una cuenta que aceptó las estadísticas de visita, partidas iniciadas durante cada una de sus visitas), y también sirve para estadísticas de uso de conjunto (cuentas activas, cuentas nuevas y cuentas que regresan, regreso de las cuentas creadas recientemente al menos 1 día y luego al menos 7 días después de su creación, jugadores únicos, partidas iniciadas por día). Estas estadísticas no nombran a ninguna cuenta, salvo la lista interna de las 10 cuentas más activas en 7 días (número de partidas jugadas y, para una cuenta que aceptó las estadísticas de visita, tiempo activo), que solo puede consultar la administración del sitio y que no da lugar a ninguna medida relativa a las cuentas que figuran en ella — base: interés legítimo. El registro no contiene ningún contenido de partida, y una cuenta eliminada deja de aparecer nombrada en él. Las cuentas del equipo de moderación quedan excluidas de estas estadísticas. Además, una cuenta creada por el equipo para probar el sitio puede ser marcada como «cuenta de prueba» por la administración: queda entonces fuera de estas estadísticas (cuentas activas, jugadores únicos, partidas iniciadas), incluida la lista de las cuentas más activas, sin que se borre ningún dato; la lista de estas cuentas solo contiene su identificador técnico, y cada marcado o desmarcado queda registrado.

### 3.5 Chat de voz

El chat de voz utiliza una conexión **entre pares (WebRTC)**: la voz **no se graba ni se almacena** en nuestros servidores. El servidor solo transmite la señalización técnica (puesta en contacto) y, si es necesario, un relé cifrado (TURN) sin conservación. Para establecer la conexión, su navegador consulta servidores públicos de Google (STUN), que reciben su dirección IP (véase 6); como en toda conexión entre pares, los navegadores de los demás participantes en el chat de voz también pueden recibir su dirección IP.

### 3.6 Moderación de apodos

Cuando el filtro de lenguaje rechaza un apodo (registro, cambio de nombre), se conserva una traza del intento (nombre intentado, contexto, user-agent) con fines de moderación y prevención de abusos — base: interés legítimo. Conservación: **12 meses** como máximo.

### 3.7 Comentarios de usuarios

Si utiliza el formulario de comentarios, podemos recoger:

- su mensaje;
- capturas de pantalla que adjunte voluntariamente;
- correo de contacto (opcional);
- contexto técnico (página visitada, navegador).

Al final de su primerísima partida, una tarjeta le propone **puntuar esa partida** de 1 a 5, con un comentario opcional; no vuelve a aparecer una vez que la ha rellenado o rechazado. Si puntúa, registramos la nota, el juego, el modo de juego (en línea o local), su comentario si lo hay y el mismo contexto técnico (página visitada, sin sus parámetros, y navegador), vinculados a su cuenta si está conectado; el correo electrónico de su cuenta no se copia en la valoración, que sigue el plazo de conservación de los comentarios (véase 7). Si está conectado, registramos también en su cuenta la fecha en la que puntuó o rechazó («No, gracias»), para no volver a preguntarle: ni la nota ni su elección figuran en ella. Por el mismo motivo, su navegador guarda una marca en su almacenamiento local (`lp-first-game-feedback`): solo recuerda si este dispositivo ya se había utilizado en el sitio, la fecha de su primera visita (que solo sirve durante 24 horas), si ya se ha hecho la pregunta y cuántas veces se ha mostrado la tarjeta; no contiene ningún identificador y nunca se envía a nuestros servidores.

### 3.8 Cookies

El Servicio utiliza las siguientes cookies:

| Cookie | Finalidad | Duración |
|--------|-----------|----------|
| `lp_session` | Mantener su sesión iniciada | 30 días (91 días para una cuenta de invitado), prorrogados en cada visita, salvo para las cuentas del equipo de moderación |
| `lp_local_play` | Activar el modo local sin cuenta | Persistente |
| `lp_age_verified` | Recordar su declaración de edad (18+), exigida antes de crear una cuenta de invitado | 1 año |
| `lp_analytics_consent` | Recordar su elección sobre las estadísticas de visita (la pregunta se vuelve a plantear si cambia lo que abarcan) | 1 año |
| `lp_locale` | Recordar su idioma de interfaz | 1 año |
| `lp_vid` | Identificador del navegador para las estadísticas de visita — **instalada únicamente si las ha aceptado, retirada si las rechaza** | 1 año |

Puede cambiar su elección en cualquier momento, sin eliminar sus cookies, con el enlace «Estadísticas de visita» del menú y del pie de la página de inicio: vuelve a abrir la elección Aceptar / Rechazar. Rechazar borra inmediatamente los datos descritos en el apartado 3.3 para este navegador y, si está conectado y había aceptado las estadísticas en este navegador, el historial de visitas de su cuenta. La elección solo vale para este navegador.

## 4. Finalidades del tratamiento

Sus datos se tratan para:

- crear y gestionar su cuenta;
- autenticar sus conexiones;
- sincronizar sus jugadores y estadísticas entre dispositivos;
- hacer funcionar las partidas en línea (mesas, chat, clasificaciones) y seguir su uso (registro de partidas, consultable cuenta por cuenta por la administración del sitio);
- garantizar la seguridad del Servicio y prevenir los abusos;
- moderar las cuentas y los contenidos (suspensión, baneo en caso de infracción);
- responder a sus solicitudes de soporte y comentarios;
- producir estadísticas de visita, incluido el historial de visitas de su cuenta (con su consentimiento);
- cumplir nuestras obligaciones legales.

**No vendemos** sus datos personales a terceros.

## 5. Base legal

| Tratamiento | Base legal |
|-------------|------------|
| Cuenta y autenticación | Ejecución del contrato (CGU) |
| Estadísticas de juego, amigos, clasificaciones | Ejecución del contrato |
| Chat y partidas en línea | Ejecución del contrato |
| Seguridad y moderación (cuentas, apodos, contenidos) | Interés legítimo |
| Fecha de última actividad de la cuenta (estado «en línea» visible para sus amigos, número de cuentas en línea, seguridad, eliminación de las cuentas de invitado inactivas) | Interés legítimo |
| Registro de partidas iniciadas (seguimiento del uso, denuncias, consulta cuenta por cuenta por la administración del sitio) | Interés legítimo |
| Estadísticas de visita (cookie `lp_vid`, IP, país, dispositivo, nombres de los jugadores locales, historial de visitas de la cuenta) | **Consentimiento** |
| Puerta de edad (cookie) | Interés legítimo (conformidad) |
| Comentarios | Consentimiento (envío voluntario) |

## 6. Destinatarios y encargados

Sus datos pueden ser tratados por:

- **El proveedor de alojamiento del Servicio**: OVH SAS — 2 rue Kellermann, 59100 Roubaix (Francia). El servidor aloja la base de datos y sus copias de seguridad diarias (véase 7).
- **Cloudflare, Inc.** (intermediario técnico: proxy y red de distribución de contenidos) — Estados Unidos. Todas las solicitudes dirigidas al Servicio pasan por Cloudflare antes de llegar a nuestro servidor: Cloudflare recibe, por tanto, su dirección IP y el contenido de los intercambios con el sitio, que encamina hasta nuestro servidor (con almacenamiento en caché de los archivos públicos del sitio y protección contra ataques). También nos indica el país estimado de su dirección IP (véase 3.3). Además, Cloudflare almacena la réplica externa de las copias de seguridad de la base de datos (servicio de almacenamiento R2, véase 7). Dado que Cloudflare puede tratar estos datos fuera de la Unión Europea, en particular en Estados Unidos, estas transferencias se rigen por las cláusulas contractuales tipo de la Comisión Europea o por el Marco de Privacidad de Datos UE-EE. UU. (Data Privacy Framework), según los compromisos de este proveedor.
- **Resend** (envío de correos de restablecimiento de contraseña) — Estados Unidos, con garantías contractuales apropiadas
- **Google** — si utiliza el inicio de sesión con Google: el inicio de sesión se realiza ante Google, que trata los datos del inicio de sesión en su cuenta de Google conforme a sus propias normas de privacidad, como responsable del tratamiento independiente, y después nos transmite los datos descritos en el apartado 3.1. El botón «Continuar con Google» se carga desde los servidores de Google en la página Cuenta: con solo mostrarse, transmite ya a Google su dirección IP e información técnica sobre su navegador. Para el chat de voz, su navegador también consulta servidores públicos de Google (STUN), que reciben su dirección IP (véase 3.5). Google puede tratar estos datos fuera de la Unión Europea.

El editor sigue siendo el responsable de los tratamientos descritos en esta política. No se realiza ninguna otra transferencia a terceros sin su consentimiento, salvo obligación legal.

## 7. Plazos de conservación

- **Cuenta activa**: datos conservados mientras exista la cuenta.
- **Cuenta de invitado** (creada sin email ni contraseña: escaneando un código QR, mediante un enlace de invitación o con «Pruébalo con bots»): se elimina automáticamente tras **90 días** de inactividad, con todo lo que contiene (apodo, progresión, cosméticos, amigos). Solo es accesible mediante la cookie de sesión del navegador (o de la aplicación) en el que se creó: cada visita desde ese navegador reinicia este plazo, pero no es accesible desde otro navegador ni desde otro dispositivo, y cerrar sesión, iniciar sesión con otra cuenta en ese navegador o borrar las cookies la deja definitivamente inaccesible. Una cuenta de invitado que ya no tiene ninguna sesión válida (tras un cierre de sesión, un inicio de sesión con otra cuenta en ese navegador o la caducidad de su sesión) se elimina antes, tras **7 días** de inactividad, salvo que esté baneada o sea objeto de una denuncia pendiente de revisión. Añadir un email y una contraseña, o vincular la cuenta a Google, la hace permanente.
- **Cuenta eliminada**: supresión o anonimización en un plazo máximo de **12 meses** tras la solicitud, salvo obligación legal de conservación más larga.
- **Registros técnicos (direcciones IP, presencia)**: **6 meses**. La dirección IP y el país de la última conexión asociados a una cuenta se borran tras **6 meses** sin actividad; el historial de direcciones IP de una cuenta se elimina inmediatamente junto con la cuenta, y un control automático borra también cualquier historial de direcciones IP que siga asociado a una cuenta eliminada.
- **Historial de visitas de una cuenta** (inicio, final, tiempos con la página mostrada / activo / en partida, tipo de dispositivo): **6 meses** desde el inicio de cada visita; se borra inmediatamente al retirar el consentimiento a las estadísticas de visita desde un navegador conectado a esa cuenta en el que se habían aceptado, o cuando la cuenta se une al equipo de moderación, y se elimina junto con la cuenta.
- **Sesiones de conexión**: se eliminan al cerrar sesión o, automáticamente, una vez caducadas.
- **Mensajes de chat**: **12 meses**.
- **Registro de partidas iniciadas** (juego, fecha, duración de la mesa, motivo de finalización, participantes): **12 meses**.
- **Trazas de moderación de apodos**: **12 meses**.
- **Datos de medición de audiencia**: **13 meses**.
- **Comentarios**: conservación hasta **24 meses** o supresión previa solicitud; el correo electrónico de contacto asociado se borra si elimina su cuenta.
- **Cookies de edad y consentimiento**: 1 año, renovables en cada validación.
- **Copias de seguridad de la base de datos** (copia de todos los datos anteriores): **16 días como máximo** en el servidor y **31 días como máximo** para la réplica externa; un dato eliminado desaparece de las copias de seguridad cuando estas caducan.

Estos plazos se aplican automáticamente mediante purgas regulares.

## 8. Sus derechos

Conforme al RGPD, usted dispone de los siguientes derechos:

- **Acceso**: obtener una copia de sus datos;
- **Rectificación**: corregir datos inexactos;
- **Supresión**: solicitar la eliminación de sus datos;
- **Limitación**: restringir determinados tratamientos;
- **Oposición**: oponerse a un tratamiento basado en el interés legítimo;
- **Retirada del consentimiento**: en cualquier momento, para los tratamientos basados en el consentimiento. Para las estadísticas de visita, mediante el enlace «Estadísticas de visita» (menú y pie de la página de inicio): la retirada borra de inmediato los datos de este navegador y el historial de visitas de la cuenta conectada, en todos los dispositivos; vale para este navegador, y los demás navegadores en los que las hubiera aceptado siguen registrando sus visitas mientras no las rechace también allí;
- **Portabilidad**: recibir sus datos en un formato estructurado (en su caso).

Puede **eliminar su cuenta directamente** desde la página Cuenta (botón «Eliminar mi cuenta»): la eliminación es inmediata y definitiva.

Para ejercer sus demás derechos, contacte con: lepillaveur@outlook.fr

También puede presentar una reclamación ante la **CNIL** (www.cnil.fr).

## 9. Seguridad

Aplicamos medidas técnicas y organizativas apropiadas:

- contraseñas con hash (bcrypt);
- cookies de sesión seguras;
- cabeceras de seguridad HTTP (CSP, etc.);
- acceso de administrador restringido.

Ninguna transmisión por Internet es totalmente segura; no podemos garantizar una seguridad absoluta.

## 10. Menores

El Servicio está destinado a personas de **18 años cumplidos**. No recogemos a sabiendas datos personales de menores. Si cree que un menor nos ha transmitido datos, contáctenos para solicitar su supresión.

## 11. Modificaciones

Esta política puede actualizarse. La fecha de la última revisión figura al principio del documento. Le animamos a consultarla regularmente.

## 12. Enlaces útiles

- [Condiciones Generales de Uso](/legal/cgu)
- [Aviso legal](/legal/mentions-legales)
