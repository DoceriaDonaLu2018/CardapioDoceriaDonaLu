import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatCpfMask, isValidCpf, normalizeCpf } from "./cpf";

describe("CPF", () => {
  it("normaliza apenas dígitos e limita a 11", () => {
    assert.equal(normalizeCpf("191.191.191-00"), "19119119100");
    assert.equal(normalizeCpf("123456789091111"), "12345678909");
  });

  it("rejeita vazios, repetidos e tamanhos inválidos", () => {
    assert.equal(isValidCpf(""), false);
    assert.equal(isValidCpf("00000000000"), false);
    assert.equal(isValidCpf("11111111111"), false);
    assert.equal(isValidCpf("123"), false);
    assert.equal(isValidCpf("<script>"), false);
  });

  it("aceita CPF válido conhecido", () => {
    assert.equal(isValidCpf("529.982.247-25"), true);
    assert.equal(isValidCpf("52998224725"), true);
  });

  it("rejeita CPF com dígitos verificadores errados", () => {
    assert.equal(isValidCpf("529.982.247-24"), false);
    assert.equal(isValidCpf("19119119101"), false);
  });

  it("formata máscara progressiva", () => {
    assert.equal(formatCpfMask("529"), "529");
    assert.equal(formatCpfMask("52998"), "529.98");
    assert.equal(formatCpfMask("52998224725"), "529.982.247-25");
  });
});
