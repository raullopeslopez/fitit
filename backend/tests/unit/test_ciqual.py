"""Las reglas de normalización de CIQUAL.

Es la parte del import que puede corromper el catálogo en silencio: una regla
mal puesta no lanza ningún error, sólo deja tres mil alimentos afirmando cosas
falsas sobre lo que contienen. Documentadas en `scripts/ciqual_rules.md`.
"""

import pytest

from scripts.ciqual import CiqualValueError, nutrient_key, parse_value, row_to_food


class TestParseValue:
    def test_coma_decimal(self):
        assert parse_value("45,4") == 45.4

    def test_espacios_de_millar(self):
        # El fichero es francés y usa el espacio como separador de millares,
        # tanto el normal como el fino insecable.
        assert parse_value("1 234,5") == 1234.5
        assert parse_value("1 234,5") == 1234.5

    @pytest.mark.parametrize("raw", ["-", "", "   ", None])
    def test_no_determinado_es_desconocido(self, raw):
        # `-` es el «non déterminé» de CIQUAL. Nadie lo midió.
        assert parse_value(raw) is None

    def test_cero_es_una_medicion(self):
        # Y por tanto NO es desconocido. Es la mitad de la invariante.
        assert parse_value("0") == 0.0

    def test_trazas_es_cero_no_desconocido(self):
        # «traces» es un resultado: se midió y sale por debajo del límite de
        # cuantificación. Desconocido tiraría esa información y contagiaría el
        # total del día. Decisión de usuario, 2026-08-31.
        assert parse_value("traces") == 0.0
        assert parse_value("Traces") == 0.0

    def test_por_debajo_del_limite_es_el_punto_medio(self):
        # `< 0,3` no es 0,3 ni es 0: es algo dentro de [0, 0,3], y el punto
        # medio es el único valor del intervalo que no elige un extremo.
        assert parse_value("< 0,3") == 0.15
        assert parse_value("<0,3") == 0.15

    def test_una_forma_nueva_para_el_import(self):
        # A propósito, y no `None`: una edición futura con una forma que estas
        # reglas no conocen tiene que parar el import, no colarse como miles de
        # nutrientes «desconocidos» que nadie va a mirar.
        with pytest.raises(CiqualValueError):
            parse_value("environ 5")


class TestNutrientKey:
    @pytest.mark.parametrize(
        ("header", "expected"),
        [
            ("Sodium (mg/100 g)", "sodium_mg"),
            ("Vitamine B12 (µg/100 g)", "vitamine_b12_ug"),
            ("Cholestérol (mg/100 g)", "cholesterol_mg"),
            ("Eau (g/100 g)", "eau_g"),
            (
                "Energie, Règlement UE N° 1169/2011 (kJ/100 g)",
                "energie_reglement_ue_n_1169_2011_kj",
            ),
        ],
    )
    def test_clave_estable_con_unidad(self, header, expected):
        assert nutrient_key(header) == expected

    def test_los_parentesis_de_dentro_no_se_confunden_con_la_unidad(self):
        # La unidad va en el ÚLTIMO paréntesis, y hay nombres con paréntesis
        # propios. Buscar «un paréntesis» captura `n-6` y pierde los gramos.
        key = nutrient_key("AG 18:2 9c,12c (n-6), linoléique (g/100 g)")
        assert key.endswith("_g")
        assert "n_6" in key

    def test_la_unidad_va_en_la_clave(self):
        # El valor es un número desnudo: sin la unidad en la clave, sumar hierro
        # en mg con yodo en µg no tiene forma de saber que están mezclados.
        assert nutrient_key("Fer (mg/100 g)") != nutrient_key("Iode (µg/100 g)")


class TestRowToFood:
    def row(self, **overrides):
        base = {
            "alim_code": 9621.0,
            "alim_nom_fr": "Son de blé",
            "alim_grp_code": "03",
            "alim_ssgrp_code": "0301",
            "Energie, Règlement UE N° 1169/2011 (kcal/100 g)": "279",
            "Protéines, N x facteur de Jones (g/100 g)": "15,4",
            "Lipides (g/100 g)": "< 0,3",
            "Glucides (g/100 g)": "-",
            "Fibres alimentaires (g/100 g)": "42,8",
            "Sodium (mg/100 g)": "traces",
        }
        base.update(overrides)
        return base

    def test_los_codigos_de_grupo_pasan_a_la_fila(self):
        """Lo que deja a una regla decir «verdura» o «legumbre»."""
        food = row_to_food(self.row())
        assert food["group_code"] == "03"
        assert food["subgroup_code"] == "0301"

    def test_un_alimento_sin_grupo_queda_sin_clasificar_y_no_en_ninguno(self):
        """Los 45 «aliment moyen» de CIQUAL. `None` es «no se sabe», y una regla
        de verduras tiene que contarlos aparte en vez de darlos por no-verdura."""
        food = row_to_food(self.row(alim_grp_code="", alim_ssgrp_code=""))
        assert food["group_code"] is None
        assert food["subgroup_code"] is None

    def test_macros_a_columna_propia(self):
        food = row_to_food(self.row())
        assert food["kcal_100g"] == 279
        assert food["protein_100g"] == 15.4
        assert food["fat_100g"] == 0.15  # de `< 0,3`
        assert food["fiber_100g"] == 42.8

    def test_un_glucido_no_determinado_no_es_cero_gramos_de_glucidos(self):
        assert row_to_food(self.row())["carbs_100g"] is None

    def test_el_resto_va_al_json(self):
        assert row_to_food(self.row())["nutrients"]["sodium_mg"] == 0.0

    def test_el_codigo_es_entero_no_float(self):
        # xlrd lee los códigos como 9621.0; es la clave de idempotencia del
        # import, así que «9621.0» y «9621» no pueden ser dos alimentos.
        assert row_to_food(self.row())["source_ref"] == "9621"

    def test_kcal_medidas_no_son_estimadas(self):
        assert row_to_food(self.row())["kcal_estimated"] is False

    def test_sin_kcal_con_macros_completos_se_estiman_por_atwater(self):
        """El plátano macho: CIQUAL no trae energía, pero sí los macros. Sin
        esto, un solo plátano deja las kcal del día entero sin número."""
        food = row_to_food(
            self.row(
                **{
                    "Energie, Règlement UE N° 1169/2011 (kcal/100 g)": "-",
                    "Protéines, N x facteur de Jones (g/100 g)": "1,28",
                    "Lipides (g/100 g)": "0,39",
                    "Glucides (g/100 g)": "29,6",
                    "Fibres alimentaires (g/100 g)": "2,3",
                }
            )
        )
        # 4·1,28 + 9·0,39 + 4·29,6 + 2·2,3
        assert food["kcal_100g"] == 131.63
        assert food["kcal_estimated"] is True

    def test_la_fibra_desconocida_no_impide_estimar(self):
        # Es el macro que menos energía da (2 kcal/g), y CIQUAL la deja en
        # blanco a menudo: exigirla dejaría fuera casi un centenar de alimentos.
        food = row_to_food(
            self.row(
                **{
                    "Energie, Règlement UE N° 1169/2011 (kcal/100 g)": "-",
                    "Glucides (g/100 g)": "10",
                    "Fibres alimentaires (g/100 g)": "-",
                }
            )
        )
        # 4·15,4 + 9·0,15 + 4·10
        assert food["kcal_100g"] == 102.95
        assert food["kcal_estimated"] is True

    def test_sin_kcal_y_con_un_macro_desconocido_no_se_inventa_nada(self):
        # Proteína, grasa o hidratos en blanco: la estimación ya no es una
        # estimación, es un número al que le falta un trozo sin decirlo.
        food = row_to_food(self.row(**{"Energie, Règlement UE N° 1169/2011 (kcal/100 g)": "-"}))
        assert food["kcal_100g"] is None
        assert food["kcal_estimated"] is False

    def test_procedencia_y_convencion(self):
        food = row_to_food(self.row())
        assert food["source"] == "ciqual"
        # La fibra va aparte de los glúcidos: convención europea.
        assert food["carb_convention"] == "available"
