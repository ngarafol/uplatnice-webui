import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addInterval,
  advanceNextDue,
  daysUntil,
  dueLabel,
  isDueSoon,
  isOverdue,
  lastDayOfMonth,
  monthKey,
  monthLabel,
  monthLabelIn,
} from '../recurring.js';

test('mjesec se kraji na zadnji dan ciljanog mjeseca', () => {
  assert.equal(addInterval('2026-01-31', 'mjesec', 1), '2026-02-28');
  assert.equal(addInterval('2024-01-31', 'mjesec', 1), '2024-02-29', 'prijestupna godina');
  assert.equal(addInterval('2026-03-31', 'mjesec', 1), '2026-04-30');
  assert.equal(addInterval('2026-01-15', 'mjesec', 1), '2026-02-15');
});

test('negativan interval (vraćanje dospijeća unazad)', () => {
  assert.equal(addInterval('2026-12-05', 'mjesec', -1), '2026-11-05');
  assert.equal(addInterval('2026-03-31', 'mjesec', -1), '2026-02-28');
  assert.equal(addInterval('2026-01-15', 'tjedan', -2), '2026-01-01');
});

test('tjedan i dan', () => {
  assert.equal(addInterval('2026-01-15', 'tjedan', 2), '2026-01-29');
  assert.equal(addInterval('2026-01-15', 'dan', 14), '2026-01-29');
});

test('plaćeno pomiče dospijeće na sljedeći budući period', () => {
  assert.equal(advanceNextDue('2026-01-05', 'mjesec', 1, '2026-01-20'), '2026-02-05');
  assert.equal(advanceNextDue('2026-02-05', 'mjesec', 1, '2026-01-20'), '2026-03-05', 'plaćanje unaprijed');
  assert.equal(advanceNextDue('2026-01-05', 'mjesec', 1, '2026-03-10'), '2026-04-05', 'dva preskočena mjeseca');
  assert.equal(advanceNextDue('2026-01-31', 'mjesec', 1, '2026-01-31'), '2026-02-28');
});

test('dospijeće i oznake', () => {
  assert.equal(daysUntil('2026-01-20', '2026-01-15'), 5);
  assert.equal(daysUntil('2026-01-10', '2026-01-15'), -5);
  assert.equal(dueLabel('2026-01-15', '2026-01-15'), 'dospijeva danas');
  assert.equal(dueLabel('2026-01-16', '2026-01-15'), 'dospijeva sutra');
  assert.equal(dueLabel('2026-01-18', '2026-01-15'), 'dospijeva za 3 dana');
  assert.equal(dueLabel('2026-01-10', '2026-01-15'), 'kasni 5 dana');
  assert.equal(dueLabel(null), 'jednokratno');
  assert.ok(isDueSoon('2026-01-20', '2026-01-15'));
  assert.ok(!isDueSoon('2026-01-25', '2026-01-15'));
  assert.ok(!isDueSoon(null, '2026-01-15'), 'jednokratna nikad ne dospijeva');
  assert.ok(isOverdue('2026-01-10', '2026-01-15'));
});

test('mjesec: ključ, zadnji dan i naziv', () => {
  assert.equal(monthKey('2026-10-27T10:00:00.000Z'), '2026-10');
  assert.equal(lastDayOfMonth('2026-10'), '2026-10-31');
  assert.equal(lastDayOfMonth('2026-02'), '2026-02-28');
  assert.equal(lastDayOfMonth('2024-02'), '2024-02-29', 'prijestupna godina');
  assert.equal(lastDayOfMonth('2026-12'), '2026-12-31');
  assert.equal(monthLabel('2026-10'), 'listopad 2026.');
  assert.equal(monthLabel('2026-01'), 'siječanj 2026.');
  assert.equal(monthLabelIn('2026-10'), 'listopadu 2026.');
  assert.equal(monthLabelIn('2026-01'), 'siječnju 2026.');
  assert.equal(monthLabelIn('2026-03'), 'ožujku 2026.');
});
