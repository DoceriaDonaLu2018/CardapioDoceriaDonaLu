import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Dados iniciais do cardápio. Reaproveita a estrutura do antigo mock
 * (`data/menu.ts`), convertendo os preços de "R$ 7,00" para número.
 */
const seedData = [
  {
    name: "Cafés",
    slug: "cafes",
    order: 1,
    products: [
      {
        title: "Espresso Tradicional",
        description: "Grãos 100% arábica, torra média, extração intensa.",
        price: 7.0,
        imageUrl:
          "https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Cappuccino Cremoso",
        description:
          "Espresso, leite vaporizado e espuma aveludada com canela.",
        price: 12.0,
        imageUrl:
          "https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Café Latte",
        description: "Espresso suave envolto em leite cremoso e leve espuma.",
        price: 13.0,
        imageUrl:
          "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Mocha Belga",
        description: "Espresso, chocolate belga, leite vaporizado e chantilly.",
        price: 15.0,
        imageUrl:
          "https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?auto=format&fit=crop&w=800&q=80",
      },
    ],
  },
  {
    name: "Salgados",
    slug: "salgados",
    order: 2,
    products: [
      {
        title: "Coxinha de Frango",
        description: "Massa artesanal, frango desfiado temperado e catupiry.",
        price: 9.0,
        imageUrl:
          "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Empada de Palmito",
        description: "Massa amanteigada com recheio cremoso de palmito.",
        price: 10.0,
        imageUrl:
          "https://images.unsplash.com/photo-1509365465985-25d11c17e812?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Quiche Lorraine",
        description: "Massa crocante, creme de ovos, queijo e bacon defumado.",
        price: 14.0,
        imageUrl:
          "https://images.unsplash.com/photo-1591985666643-1ecc67616216?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Sanduíche Caprese",
        description: "Pão ciabatta, muçarela de búfala, tomate e pesto.",
        price: 18.0,
        imageUrl:
          "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80",
      },
    ],
  },
  {
    name: "Sobremesas",
    slug: "sobremesas",
    order: 3,
    products: [
      {
        title: "Cheesecake de Frutas Vermelhas",
        description:
          "Base de biscoito, creme de cream cheese e calda de frutas.",
        price: 16.0,
        imageUrl:
          "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Brownie com Nozes",
        description: "Chocolate meio amargo, nozes crocantes e textura úmida.",
        price: 13.0,
        imageUrl:
          "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Tiramisù da Casa",
        description: "Camadas de biscoito, café, mascarpone e cacau em pó.",
        price: 17.0,
        imageUrl:
          "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Petit Gâteau",
        description: "Bolinho quente de chocolate com sorvete de creme.",
        price: 19.0,
        imageUrl:
          "https://images.unsplash.com/photo-1624353365286-3f8d62daad51?auto=format&fit=crop&w=800&q=80",
      },
    ],
  },
  {
    name: "Bebidas",
    slug: "bebidas",
    order: 4,
    products: [
      {
        title: "Suco de Laranja Natural",
        description: "Laranjas frescas espremidas na hora, sem açúcar.",
        price: 11.0,
        imageUrl:
          "https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Chocolate Quente",
        description: "Chocolate ao leite cremoso finalizado com chantilly.",
        price: 14.0,
        imageUrl:
          "https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Chá Gelado de Hibisco",
        description: "Infusão de hibisco com toque cítrico e hortelã.",
        price: 10.0,
        imageUrl:
          "https://images.unsplash.com/photo-1499638673689-79a0b5115d87?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Smoothie de Frutas Vermelhas",
        description: "Morango, amora, mirtilo e iogurte natural batidos.",
        price: 15.0,
        imageUrl:
          "https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=800&q=80",
      },
    ],
  },
  {
    name: "Pães de Queijo",
    slug: "paes-de-queijo",
    order: 5,
    products: [
      {
        title: "Pão de Queijo Tradicional",
        description: "Receita mineira com queijo canastra e polvilho azedo.",
        price: 6.0,
        imageUrl:
          "https://images.unsplash.com/photo-1601000938259-9e92002320b2?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Pão de Queijo Recheado",
        description: "Massa dourada recheada com catupiry cremoso.",
        price: 9.0,
        imageUrl:
          "https://images.unsplash.com/photo-1586444248902-2f64eddc13df?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Cestinha de Pão de Queijo",
        description: "Porção generosa servida quentinha, ideal para dividir.",
        price: 22.0,
        imageUrl:
          "https://images.unsplash.com/photo-1568051243858-533a607809a5?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Pão de Queijo Integral",
        description: "Versão leve com polvilho integral e queijo minas.",
        price: 8.0,
        imageUrl:
          "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80",
      },
    ],
  },
  {
    name: "Empório",
    slug: "emporio",
    order: 6,
    products: [
      {
        title: "Café em Grãos 250g",
        description: "Torra artesanal, notas de chocolate e caramelo.",
        price: 34.0,
        imageUrl:
          "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Geleia Artesanal",
        description:
          "Frutas selecionadas cozidas lentamente, sem conservantes.",
        price: 28.0,
        imageUrl:
          "https://images.unsplash.com/photo-1595475207225-428b62bda831?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Mel Silvestre 300g",
        description: "Mel puro de florada silvestre, colhido em Minas Gerais.",
        price: 32.0,
        imageUrl:
          "https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=800&q=80",
      },
      {
        title: "Caneca Dona Lu",
        description: "Caneca de cerâmica exclusiva com a marca da casa.",
        price: 45.0,
        imageUrl:
          "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=800&q=80",
      },
    ],
  },
];

async function main() {
  console.log("🌱 Limpando dados existentes...");
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  console.log("🌱 Populando categorias e produtos...");
  for (const category of seedData) {
    await prisma.category.create({
      data: {
        name: category.name,
        slug: category.slug,
        order: category.order,
        products: {
          create: category.products.map((product) => ({
            title: product.title,
            description: product.description,
            price: product.price,
            imageUrl: product.imageUrl,
            isAvailable: true,
          })),
        },
      },
    });
  }

  console.log("✅ Seed concluído com sucesso!");
}

main()
  .catch((error) => {
    console.error("❌ Erro ao executar o seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
