"""A qué familia pertenece un alimento, para que una regla pueda nombrarla.

«Verdura en la comida» o «legumbres tres veces por semana» necesitan que la app
sepa qué es una verdura. CIQUAL lo sabe: clasifica sus 3.185 alimentos en tres
niveles, y las seis primeras columnas de su hoja son eso. Lo que se guarda son
**los códigos**, no los nombres: `0201` es estable y no habla ningún idioma,
mientras que `légumes` habría que traducirlo y mantenerlo traducido.

El nivel 1 son once cajones demasiado gruesos para una regla —frutas, verduras,
legumbres y frutos secos caen todos en el mismo—. El útil es el **nivel 2**, y
sobre él se define el vocabulario que las reglas hablan.

**Un alimento sin clasificar no es «no es verdura».** Cuarenta y cinco filas de
CIQUAL no tienen grupo (los «aliment moyen»), y ninguno de los alimentos que das
de alta a mano lo tiene. `familia()` devuelve `None` en esos casos, y una regla
que cuente verduras tiene que contarlos aparte y decir cuántos no pudo
clasificar — nunca darlos por no-verdura. Es la regla del `NULL` otra vez.
"""

from __future__ import annotations

# Nivel 1. Se guarda porque es gratis y sirve para agrupar en pantalla; para
# reglas no vale: «frutas, verduras, legumbres y frutos secos» es un solo
# cajón.
GRUPOS = {
    "01": "Entradas y platos compuestos",
    "02": "Frutas, verduras, legumbres y frutos secos",
    "03": "Cereales y derivados",
    "04": "Carnes, huevos y pescados",
    "05": "Lácteos",
    "06": "Aguas y bebidas",
    "07": "Productos azucarados",
    "08": "Helados y sorbetes",
    "09": "Grasas y aceites",
    "10": "Ingredientes y ayudas culinarias",
    "11": "Alimentos infantiles",
}

# Nivel 2, los que una regla puede querer nombrar.
SUBGRUPOS = {
    "0201": "Verduras",
    "0202": "Patatas y otros tubérculos",
    "0203": "Legumbres",
    "0204": "Frutas",
    "0205": "Frutos secos y semillas",
    "0301": "Pasta, arroz y cereales",
    "0401": "Carnes cocinadas",
    "0402": "Carnes crudas",
    "0404": "Derivados cárnicos",
    "0405": "Pescados cocinados",
    "0406": "Pescados crudos",
    "0409": "Pescados y mariscos preparados",
    "0410": "Huevos",
    "0501": "Leches",
    "0502": "Lácteos frescos",
}

# El vocabulario que hablan las reglas. Una familia agrupa los subgrupos que
# para comer son lo mismo: a nadie le importa si el pescado estaba crudo o
# cocinado cuando la regla dice «pescado dos veces por semana».
FAMILIAS: dict[str, tuple[str, ...]] = {
    "verdura": ("0201",),
    "tuberculo": ("0202",),
    "legumbre": ("0203",),
    "fruta": ("0204",),
    "frutos_secos": ("0205",),
    "cereal": ("0301",),
    "carne": ("0401", "0402", "0404"),
    "pescado": ("0405", "0406", "0409"),
    "huevo": ("0410",),
    "lacteo": ("0501", "0502"),
}

# Nombre de la familia, para la pantalla.
FAMILIA_ES = {
    "verdura": "Verdura",
    "tuberculo": "Tubérculo",
    "legumbre": "Legumbre",
    "fruta": "Fruta",
    "frutos_secos": "Frutos secos",
    "cereal": "Cereal",
    "carne": "Carne",
    "pescado": "Pescado",
    "huevo": "Huevo",
    "lacteo": "Lácteo",
}

_POR_SUBGRUPO = {code: familia for familia, codes in FAMILIAS.items() for code in codes}


def familia(subgroup_code: str | None) -> str | None:
    """La familia de un subgrupo, o `None` si no se sabe.

    `None` significa **sin clasificar**, nunca «no es de esta familia». Quien
    cuente familias tiene que contar los `None` aparte y decir cuántos hay.
    """
    if not subgroup_code:
        return None
    return _POR_SUBGRUPO.get(subgroup_code.strip())


def nombre_de_grupo(group_code: str | None) -> str | None:
    return GRUPOS.get((group_code or "").strip()) if group_code else None


def nombre_de_subgrupo(subgroup_code: str | None) -> str | None:
    return SUBGRUPOS.get((subgroup_code or "").strip()) if subgroup_code else None
