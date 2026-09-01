/** npx tsx lib/mcp/huecosText.test.ts */
import { detectarHueco, preguntaPara } from './huecosText'

let ok = 0, fail = 0
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { ok++; console.log(`  ok  ${msg}`) }
  else { fail++; console.error(`  FAIL ${msg}\n       esperado ${e}\n       fue      ${a}`) }
}
const tipo = (v: unknown) => detectarHueco(v)?.tipo ?? null

console.log('\nEL CASO REAL — la apuesta del semestre 2026-H2')
const real = 'Generar retiros por $. del trading para fin de anio'
eq(tipo(real), 'cifra_faltante', 'detecta la cifra que falta en el texto real del usuario')
eq(detectarHueco(real)?.confianza, 'alta', 'con confianza alta: un $ sin dígitos está truncado, no es prosa')
eq(detectarHueco(real)?.faltaQue, 'el monto', 'y sabe que lo que falta es el monto')

console.log('\nvacío y ausente')
eq(tipo(''), 'vacio', 'string vacío')
eq(tipo('   '), 'vacio', 'solo espacios')
eq(tipo(null), 'vacio', 'null')
eq(tipo(undefined), 'vacio', 'undefined')
eq(tipo('[]'), 'vacio', 'checklist vacío (se guarda como JSON "[]", no como "")')

console.log('\nplaceholders solos')
eq(tipo('?'), 'placeholder', 'un signo de pregunta suelto')
eq(tipo('___'), 'placeholder', 'guiones bajos')
eq(tipo('TBD'), 'placeholder', 'TBD')
eq(tipo('a definir'), 'placeholder', '"a definir"')
eq(tipo('XX'), 'placeholder', 'XX')
eq(tipo('...'), 'placeholder', 'puntos suspensivos solos')

console.log('\nlo que NO es hueco (evitar falsos positivos)')
eq(tipo('Generar retiros por $15.000 del trading'), null, 'con la cifra puesta NO es hueco')
eq(tipo('Llegar a 100 clientes en la mentoria'), null, 'la apuesta 2 del usuario, que sí tiene número')
eq(tipo('USD 7250 repartidos en 15 billeteras'), null, 'moneda con número detrás')
eq(tipo('$1.450 en MercadoPago'), null, 'monto con separador de miles')
eq(tipo('Cuanto quiero retirar? todavia no lo se'), null, 'un "?" dentro de una frase NO es placeholder')
eq(tipo('Tocar Guitarra Semanalmente'), null, 'prosa normal sin números')
eq(tipo('contar, dividir, comprar USD, comprar las cuentas de fondeo'), null,
   'FALSO POSITIVO REAL: "comprar USD," con coma detrás es prosa, no monto faltante')
eq(tipo('Comprar USD en Brubank y Lemon'), null, '"USD" como sustantivo seguido de palabra')
eq(tipo('u$s 5000 para el ciclo'), null, 'u$s con número no dispara el símbolo')
eq(tipo('Ejecutar todos los dias plan de ejecución.'), null, 'una meta real del trimestre Q3 del usuario')
eq(tipo('Empezar la marca personal'), null, 'otra meta real, sin cifra y sin pretenderla')

console.log('\nfecha faltante')
eq(tipo('Cerrar la venta para el ___'), 'fecha_faltante', 'promesa de fecha sin fecha')
eq(detectarHueco('Cerrar la venta para el ___')?.confianza, 'media', 'confianza media: la heurística de fecha es más frágil')
eq(tipo('Cerrar la venta para el 15/09'), null, 'con la fecha puesta NO es hueco')

console.log('\ncantidad faltante')
eq(tipo('Llegar a ___ clientes este mes'), 'cifra_faltante', 'cantidad con hueco')
eq(tipo('Llegar a 100 clientes este mes'), null, 'con el número NO es hueco')

console.log('\nprecedencia: lo inequívoco primero')
eq(tipo('$'), 'cifra_faltante', 'un $ solo es cifra faltante')
eq(tipo('x'), 'placeholder', 'una x sola es placeholder, no cantidad')

console.log('\nla pregunta cita el texto del usuario')
const h = detectarHueco(real)!
const q = preguntaPara(h, { seccion: 'Grandes apuestas', campo: 'Apuesta #1', periodo: '2026-H2' })
eq(q.includes('2026-H2'), true, 'nombra el período')
eq(q.includes('Apuesta #1'), true, 'nombra el campo')
eq(q.includes('$.'), true, 'cita el fragmento exacto que escribió')
eq(preguntaPara({ tipo: 'vacio', confianza: 'alta', faltaQue: 'todo' },
  { seccion: 'S', campo: 'C', periodo: '2026-09' }).includes('en blanco'), true, 'el vacío pregunta distinto')

console.log(`\n${ok} ok, ${fail} fail\n`)
if (fail > 0) process.exit(1)
