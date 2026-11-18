import assert from 'node:assert/strict';
import test from 'node:test';
import { translateSpanish } from './translate.ts';

test('Spanish uses natural interface text and preserves accents', () => {
  assert.equal(translateSpanish('Courses'), 'Cursos');
  assert.equal(translateSpanish('Password'), 'Contraseña');
  assert.equal(translateSpanish('Not just the answer.'), 'No solo la respuesta.');
});
test('specific dynamic phrases take precedence over shorter phrases', () => {
  assert.equal(translateSpanish('Question 3 of 12'), 'Pregunta 3 de 12');
  assert.equal(translateSpanish('Question 3'), 'Pregunta 3');
  assert.equal(translateSpanish('4 lessons'), '4 lecciones');
});
test('interpolation preserves addresses, punctuation and values', () => {
  assert.equal(translateSpanish('Our email: math+help@example.com'), 'Nuestro correo: math+help@example.com');
  assert.equal(translateSpanish('Anonymous (A+B)'), 'Anónimo (A+B)');
  assert.equal(translateSpanish('2 of 5 questions remaining for this 24-hour period'), 'Quedan 2 de 5 preguntas en este periodo de 24 horas');
});
test('untranslated content is not guessed or altered', () => {
  const original = 'Let f(x) = x² + 1. Find its derivative.';
  assert.equal(translateSpanish(original), original);
  assert.equal(translateSpanish('Not just the answer?'), 'Not just the answer?');
});
